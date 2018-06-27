import * as path from "path";

export interface Import {
    directory: string;
    relativePath: string;
}

export class DataUriVisitor {
    public isReplacing = false;
    public isPreEvalVisitor = true;
    private visitor: Less.Visitor;
    private importsList: Import[] = [];

    constructor(less: Less.LessStaticExtensions) {
        this.visitor = new less.visitors.Visitor(this);
    }

    public run(root: Less.Node) {
        return this.visitor.visit(root);
    }

    public visitCall(callNode: Less.CallNode, visitArgs: any) {
        const { ruleNode, importedFile, entryPath } = this.getImportInfo(
            callNode
        );

        if (!importedFile) {
            return ruleNode;
        }

        this.importsList.push({
            directory: entryPath ? path.normalize(entryPath) : "",
            relativePath: importedFile
        });

        return ruleNode;
    }

    public get imports(): Import[] {
        return this.importsList;
    }

    private tryGetImportedFileName(ruleNode: Less.CallNode): string {
        // use MIME type if available.
        const fileName = ruleNode.args.length === 2 ? ruleNode.args[1] : ruleNode.args[0];

        if (!fileName.value || /@/.test(fileName.value)) {
            return null;
        }

        return fileName.value;
    }

    private getImportInfo(
        ruleNode: Less.CallNode
    ): { ruleNode: Less.CallNode; importedFile?: string; entryPath?: string } {
        if (ruleNode.name !== "data-uri" || ruleNode.args.length === 0) {
            return { ruleNode };
        }

        const importedFile = this.tryGetImportedFileName(ruleNode);

        if (!importedFile) {
            return { ruleNode };
        }

        const fileInfo =
            typeof ruleNode.fileInfo === "function"
                ? ruleNode.fileInfo()
                : ruleNode.currentFileInfo;
        const entryPath = fileInfo.entryPath;

        return { ruleNode, importedFile, entryPath };
    }
}
