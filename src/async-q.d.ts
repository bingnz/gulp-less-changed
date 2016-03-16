declare interface AsyncQ {
    some(items: any[], iterator: (item: any) => Q.Promise<boolean>): Q.Promise<boolean>;
}

declare var asyncQ: AsyncQ;

declare module 'async-q' {
    export = asyncQ;
}

