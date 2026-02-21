import * as rawConfig from "./config.json";

export type SemesterDefinition = {
    id: string;
    name: string;
    suffix: string;
};

type SemestersConfig = {
    current: string;
    fallback: string;
    semesters: SemesterDefinition[];
};

type ScraperConfig = {
    batch_size: number;
    prefixes: string[];
    prefix_weights: Record<string, number>;
};

type AppConfig = {
    semesters: SemestersConfig;
    scraper: ScraperConfig;
};

const config = rawConfig as AppConfig;

export const APP_CONFIG = config;
export const SCRAPER_CONFIG = config.scraper;
export const SEMESTER_DEFINITIONS: SemesterDefinition[] = config.semesters.semesters;
export const CURRENT_SEMESTER_ID = config.semesters.current;
export const FALLBACK_SEMESTER_ID = config.semesters.fallback;
export const SEMESTER_NAME_BY_ID: Record<string, string> = Object.fromEntries(
    SEMESTER_DEFINITIONS.map((semester) => [semester.id, semester.name]),
);
