export interface IImport {
    directories: string[];
    relativePath: string;
}

export class DataUriVisitor {
    public isReplacing = false;
    public isPreEvalVisitor = true;
    private visitor: Less.Visitor;

    constructor(
        less: Less.LessStaticExtensions,
        private addImport: (x: IImport) => void
    ) {
        this.visitor = new less.visitors.Visitor(this);
    }

    public run(root: Less.Node) {
        return this.visitor.visit(root);
    }

    public visitCall(callNode: Less.CallNode) {
        const { ruleNode, importedFile, fileInfo } = this.getImportInfo(
            callNode
        );

        if (!importedFile) {
            return ruleNode;
        }

        const directories = new Set<string>();
        directories.add(fileInfo.currentDirectory || "");
        directories.add(fileInfo.entryPath || "");

        this.addImport({
            directories: Array.from(directories),
            relativePath: importedFile
        });

        return ruleNode;
    }

    private tryGetImportedFileName(ruleNode: Less.CallNode): string {
        // use MIME type if available.
        const fileName =
            ruleNode.args.length === 2 ? ruleNode.args[1] : ruleNode.args[0];

        if (!fileName.value || /@/.test(fileName.value)) {
            return null;
        }

        return fileName.value;
    }

    private getImportInfo(
        ruleNode: Less.CallNode
    ): { ruleNode: Less.CallNode; importedFile?: string; fileInfo?: Less.RootFileInfo } {
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

        return { ruleNode, importedFile, fileInfo };
    }
}
