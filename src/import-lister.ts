import * as bluebird from "bluebird";
import * as fs from "fs";
import * as less from "less";
import * as assign from "object-assign";
import streamToArray = require("stream-to-array");
import * as File from "vinyl";
import { IImport } from "./data-uri-visitor";
import { DataUriVisitorPlugin } from "./data-uri-visitor-plugin";
import { IFileInfo } from "./import-buffer";
import { PathResolver } from "./path-resolver";

const fsAsync: any = bluebird.promisifyAll(fs);

export interface IOptions {
    paths?: string[];
}

export class ImportLister {
    public pathResolver: PathResolver;
    public lessOptions: Less.Options2;

    constructor(lessOptions?: IOptions) {
        this.lessOptions = lessOptions;
        this.pathResolver = new PathResolver();
    }

    public async listImports(file: File): Promise<IFileInfo[]> {
        if (!file) {
            return [];
        }

        const files = await this.getExistingFiles(await this.listImportsInternal(file));

        return files.map((i) => ({ path: i.path, time: i.stat.mtime.getTime() }));
    }

    private async getLessData(file: File) {
        if (file.isBuffer()) {
            return file.contents.toString();
        }

        const parts = await streamToArray(file.contents as NodeJS.ReadableStream);
        const buffers: Buffer[] = [];
        for (const part of parts) {
            buffers.push(Buffer.from(part));
        }
        return Buffer.concat(buffers).toString();
    }

    private async resolveImportPaths(additionalPaths: string[], imports: IImport[]): Promise<string[]> {
        return Promise.all(
            imports.map((i) => {
                const searchPaths = new Set<string>(i.directories);
                for (const path of additionalPaths) {
                    searchPaths.add(path);
                }
                return this.pathResolver.resolve(i.relativePath, Array.from(searchPaths));
            })
        );
    }

    private getLessOptionsForImportListing(file: File, plugin: DataUriVisitorPlugin): Less.Options2 {
        const options: Less.Options2 = assign({ filename: file.path }, this.lessOptions);

        options.plugins = options.plugins ? [plugin, ...options.plugins] : [plugin];

        return options;
    }

    private async listImportsInternal(file: File): Promise<string[]> {
        if (file == null || file.isNull()) {
            console.error("Trying to process imports for null file.");
            return [];
        }

        const pluginImports: IImport[] = [];
        const dataUriVisitorPlugin = new DataUriVisitorPlugin((i) => pluginImports.push(i));
        const options = this.getLessOptionsForImportListing(file, dataUriVisitorPlugin);

        try {
            const lessData = await this.getLessData(file);
            const renderResult = await (less as Less.RelaxedLessStatic).render(lessData, options);

            const dataUriImports = await this.resolveImportPaths(options.paths || [], pluginImports);

            return [...renderResult.imports, ...dataUriImports];
        } catch (reason) {
            const error = `Failed to process imports for '${file.path}': ${reason}`;
            console.error(error);
            throw new Error(error);
        }
    }

    private async getFileStatsIfExists(file: string) {
        try {
            const stat = await fsAsync.statAsync(file);
            return { path: file, stat };
        } catch (error) {
            if (error.code === "ENOENT") {
                console.error(`Import '${file}' not found.`);
            } else {
                throw error;
            }
        }
        return null;
    }

    private async getExistingFiles(files: string[]) {
        const results = await Promise.all(files.map(this.getFileStatsIfExists));
        return results.filter((info) => !!info && !!info.stat);
    }
}
