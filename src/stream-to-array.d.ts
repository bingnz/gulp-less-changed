declare module 'stream-to-array' {
    function toArray(stream: NodeJS.ReadableStream): Promise<any[]>;
    export = toArray;
}
