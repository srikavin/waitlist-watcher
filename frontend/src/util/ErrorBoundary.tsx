import React from "react";

export class ErrorBoundary extends React.Component<React.PropsWithChildren<any>, { hasError: boolean }> {
    constructor(props: React.PropsWithChildren<any>) {
        super(props);
        this.state = {hasError: false};
    }

    static getDerivedStateFromError(error: any) {
        return {hasError: true};
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <p>Something went wrong.</p>;
        }

        return this.props.children;
    }
}