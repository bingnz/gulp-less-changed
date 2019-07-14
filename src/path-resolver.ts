import { PathResolverError } from "./path-resolver-error";

import * as bluebird from "bluebird";
import * as fs from "fs";
import * as path from "path";

const fsAsync: any = bluebird.promisifyAll(fs);

export class PathResolver {
    public async resolve(
        inputPath: string,
        searchPaths: string[],
    ): Promise<string> {
        const pathsToTry = (searchPaths || []).concat("./").concat(process.cwd()).map((p) => path.join(p, inputPath));
        const resolvedPaths = await this.filterExistingPaths(pathsToTry);

        const validPath = resolvedPaths[0];
        if (!validPath) {
            const triedPathsDisplay = pathsToTry.map((p) => `'${p}'`).join(", ");
            throw new PathResolverError(
                `Import file '${inputPath}' wasn't found. Tried: ${triedPathsDisplay}.`,
            );
        }

        return validPath;
    }

    private async filterExistingPaths(pathsToTry: string[]) {
        const checkedPaths = await Promise.all(
            pathsToTry.map(async (p) => {
                try {
                    await fsAsync.statAsync(p);
                    return p;
                } catch (error) {
                    return null as string;
                }
            }),
        );
        return checkedPaths.filter((p) => !!p);
    }
}
