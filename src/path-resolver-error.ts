export class PathResolverError extends Error {
    public message: string;
    constructor(message: string) {
        super(message);
        this.message = message;
        this.name = (this as any).constructor.name;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, PathResolverError.prototype);
        (Error as any).captureStackTrace(this, this.name);
    }
}
