import * as bluebird from "bluebird";
import * as crypto from "crypto";
import * as fs from "fs";
import * as mkdirp from "mkdirp";
import * as os from "os";
import * as path from "path";
import * as File from "vinyl";

const fsAsync: any = bluebird.promisifyAll(fs);
const mkdirpAsync: any = bluebird.promisify(mkdirp);

export interface IFileInfo {
  path: string;
  time: number;
}

const perBufferImportCache: {
  [bufferKey: string]: { [path: string]: IFileInfo[] };
} = {};

export class ImportBuffer {
  private importLister: (file: File) => Promise<IFileInfo[]>;
  private importCache: { [path: string]: IFileInfo[] };

  constructor(
    importLister: (file: File) => Promise<IFileInfo[]>,
    private bufferKey: string,
  ) {
    if (!importLister || !(importLister instanceof Function)) {
      throw new Error("Invalid importer.");
    }
    if (!bufferKey) {
      throw new Error("A buffer key is required.");
    }

    this.importLister = importLister;
    this.importCache = perBufferImportCache[bufferKey];
    if (!this.importCache) {
      this.importCache = perBufferImportCache[bufferKey] = {};
    }
  }

  public async listImports(file: File): Promise<IFileInfo[]> {
    const useImportLister: () => Promise<IFileInfo[]> = async () => {
      try {
        const importListerResults = await this.importLister(file);
        return await this.cacheResults(file.path, importListerResults);
      } catch (error) {
        console.error(`An unknown error occurred: ${error}`);
        return [];
      }
    };

    const existingImports = await this.loadPreviousResults(file.path);
    if (!existingImports) {
      return useImportLister();
    }
    const results = await Promise.all(
      existingImports.map(this.modifiedTimeIsTheSame),
    );
    if (results.every((r) => r)) {
      return existingImports;
    }
    return useImportLister();
  }

  private async modifiedTimeIsTheSame(info: IFileInfo): Promise<boolean> {
    try {
      const stat = await fsAsync.statAsync(info.path);
      return stat.mtime.getTime() === info.time;
    } catch (error) {
      return false;
    }
  }

  private getCacheFile(filePath: string) {
    const filePathKey = `${crypto
      .createHash("md5")
      .update(filePath)
      .digest("hex")}_${path.basename(filePath)}`;
    const outputPath = path.join(os.tmpdir(), this.bufferKey);
    return path.join(outputPath, filePathKey);
  }

  private async loadPreviousResults(filePath: string): Promise<IFileInfo[]> {
    const existingImports = this.importCache[filePath];
    if (existingImports) {
      return existingImports;
    }

    const cacheFile = this.getCacheFile(filePath);
    try {
      const data = await fsAsync.readFileAsync(cacheFile);
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(
          `Failed to load cached results from '${cacheFile}'. ${error}`,
        );
      }
      return null;
    }
  }

  private async cacheResults(
    filePath: string,
    imports: IFileInfo[],
  ): Promise<IFileInfo[]> {
    this.importCache[filePath] = imports;

    const cacheFile = this.getCacheFile(filePath);
    const outputPath = path.dirname(cacheFile);

    try {
      await mkdirpAsync(outputPath);
      await fsAsync.writeFileAsync(cacheFile, JSON.stringify(imports));
    } catch (error) {
      console.error(`Failed to cache results to '${cacheFile}'. ${error}`);
    }
    return imports;
  }
}
