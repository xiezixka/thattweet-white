/// <reference types="vite/client" />

declare module '*?script' {
    const value: string;
    export default value;
}

declare module '*?loader' {
    const value: string;
    export default value;
}
