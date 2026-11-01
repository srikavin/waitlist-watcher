import {context, propagation, SpanStatusCode, trace} from "@opentelemetry/api";
import type {Attributes} from "@opentelemetry/api";
import type {BatchSpanProcessor} from "@opentelemetry/sdk-trace-base";
import type {Request} from "firebase-functions/v2/https";

let processor: BatchSpanProcessor | undefined;

if (process.env.FUNCTION_TARGET === "scraperhttp" || process.env.K_SERVICE === "scraperhttp") {
    const {NodeSDK} = require("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node");
    const {BatchSpanProcessor, TraceIdRatioBasedSampler} = require("@opentelemetry/sdk-trace-base") as typeof import("@opentelemetry/sdk-trace-base");
    const {resourceFromAttributes} = require("@opentelemetry/resources") as typeof import("@opentelemetry/resources");
    const {HttpInstrumentation} = require("@opentelemetry/instrumentation-http") as typeof import("@opentelemetry/instrumentation-http");
    const {GrpcInstrumentation} = require("@opentelemetry/instrumentation-grpc") as typeof import("@opentelemetry/instrumentation-grpc");
    const {OTLPTraceExporter} = require("@opentelemetry/exporter-trace-otlp-proto") as typeof import("@opentelemetry/exporter-trace-otlp-proto");
    const {GoogleAuth} = require("google-auth-library") as typeof import("google-auth-library");
    const auth = new GoogleAuth({scopes: "https://www.googleapis.com/auth/cloud-platform"});
    processor = new BatchSpanProcessor(new OTLPTraceExporter({
        url: "https://telemetry.googleapis.com/v1/traces",
        timeoutMillis: 2000,
        headers: async () => Object.fromEntries((await auth.getRequestHeaders()).entries()),
    }), {maxQueueSize: 512, maxExportBatchSize: 512, exportTimeoutMillis: 2500});
    new NodeSDK({
        sampler: new TraceIdRatioBasedSampler(1),
        resource: resourceFromAttributes({
            "service.name": "scraperhttp",
            "service.version": process.env.K_REVISION ?? "unknown",
            "gcp.project_id": process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "waitlist-watcher",
        }),
        spanProcessors: [processor],
        logRecordProcessors: [],
        metricReaders: [],
        instrumentations: [
            new HttpInstrumentation({ignoreIncomingRequestHook: () => true, requireParentforOutgoingSpans: true}),
            new GrpcInstrumentation(),
        ],
    }).start();
}

export function measure<T>(operation: string, task: () => T | Promise<T>, attributes: Attributes = {}): Promise<T> {
    return trace.getTracer("waitlist-watcher").startActiveSpan(operation, {attributes}, async span => {
        try {
            return await task();
        } catch (error) {
            span.recordException(error instanceof Error ? error : String(error));
            span.setStatus({code: SpanStatusCode.ERROR});
            throw error;
        } finally {
            span.end();
        }
    });
}

export function withScraperTelemetry<T extends {status: number}>(request: Request, task: () => Promise<T>): Promise<T> {
    return context.with(propagation.extract(context.active(), request.headers), async () => {
        try {
            return await measure("scraper.batch", async () => {
                const result = await task();
                const span = trace.getActiveSpan();
                span?.setAttribute("http.response.status_code", result.status);
                if (result.status >= 500) span?.setStatus({code: SpanStatusCode.ERROR});
                return result;
            }, {
                "scheduler.job": request.get("X-CloudScheduler-JobName") ?? "unknown",
                "scheduler.scheduled_at": request.get("X-CloudScheduler-ScheduleTime") ?? "unknown",
            });
        } finally {
            try {
                await processor?.forceFlush();
            } catch (error) {
                console.warn("Scraper trace flush failed", error);
            }
        }
    });
}
