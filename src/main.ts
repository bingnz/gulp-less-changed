import * as bluebird from "bluebird";
import * as crypto from "crypto";
import * as fs from "fs";
import * as PluginError from "plugin-error";
import replaceExtension = require("replace-ext");
import { Transform } from "stream";
import * as through from "through2";
import * as File from "vinyl";
import { IFileInfo, ImportBuffer } from "./import-buffer";
import { ImportLister } from "./import-lister";

const fsAsync: any = bluebird.promisifyAll(fs);

const MODULE_NAME = "gulp-less-changed";

interface IPluginOptions {
  paths?: string[];
  getOutputFileName?: (input: string) => string;
}

class ImportChecker {
  private getOutputFileName: (input: string) => string;
  constructor(
    options: IPluginOptions,
    private importBuffer: ImportBuffer,
  ) {
    this.getOutputFileName =
      options.getOutputFileName || ((input) => replaceExtension(input, ".css"));
  }

  public async checkFileForChanges(
    transform: Transform,
    file: File,
    enc: string,
    callback: (error: any, data: any) => any,
  ) {
    if (file.isNull()) {
      callback(null, null);
      return;
    }

    try {
      const changed = await this.hasFileOrDependenciesChanged(
        file,
        this.getOutputFileName(file.path),
      );

      if (changed) {
        transform.push(file);
      }
    } catch (error) {
      transform.emit(
        "error",
        new PluginError(
          MODULE_NAME,
          `Error processing \'${file.path}\': ${error}`,
        ),
      );
    } finally {
      callback(null, null);
    }
  }

  private async checkImportsHaveChanged(file: File, mainFileDate: Date) {
    function importHasChanged(importFile: IFileInfo): boolean {
      return importFile.time > mainFileDate.getTime();
    }

    try {
      const imports = await this.importBuffer.listImports(file);
      return imports.some(importHasChanged);
    } catch (error) {
      console.error(error);
      return true;
    }
  }

  private async hasFileChanged(inputFile: File, outputFilePath: string) {
    try {
      const stats = await fsAsync.statAsync(outputFilePath);
      return {
        hasFileChanged: stats.mtime < inputFile.stat.mtime,
        modifiedTime: stats.mtime,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { modifiedTime: undefined, hasFileChanged: true };
      } else {
        throw error;
      }
    }
  }

  private async hasFileOrDependenciesChanged(
    inputFile: File,
    outputFilePath: string,
  ) {
    const { modifiedTime, hasFileChanged } = await this.hasFileChanged(
      inputFile,
      outputFilePath,
    );
    if (hasFileChanged) {
      return true;
    }

    return this.checkImportsHaveChanged(inputFile, modifiedTime);
  }
}

function run(options?: IPluginOptions) {
  options = options || {};

  const importLister = new ImportLister(options);

  const instanceKey = crypto
    .createHash("md5")
    .update(__dirname + JSON.stringify(options))
    .digest("hex");
  const bufferKey = `${MODULE_NAME}-${instanceKey}`;
  const importBuffer = new ImportBuffer(
    importLister.listImports.bind(importLister),
    bufferKey,
  );

  const importChecker = new ImportChecker(options, importBuffer);

  return through.obj(function(
    file: File,
    enc: string,
    callback: (error: any, data: any) => any,
  ) {
    importChecker.checkFileForChanges(this, file, enc, callback);
  });
}

export = run;
