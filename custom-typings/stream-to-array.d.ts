declare module 'stream-to-array' {
    function toArray(stream: NodeJS.ReadableStream): PromiseLike<any[]>;
    export = toArray;
}
