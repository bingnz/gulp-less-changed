import * as less from 'less';
import * as path from 'path';

module dataUriVisitor {
    export interface Import {
        directory: string;
        relativePath: string;
    }

    export class DataUriVisitor {
        public isReplacing = false;
        public isPreEvalVisitor = true;
        private _visitor: Less.Visitor;
        private _imports: Import[] = [];

        constructor(less: Less.LessStaticExtensions) {
            this._visitor = new less.visitors.Visitor(this);
        }

        run(root: Less.Node) {
            return this._visitor.visit(root);
        }

        private tryGetImportedFileName(ruleNode: Less.CallNode): string {
            let fileName: any;

            if (ruleNode.args.length === 2) { // specifying MIME type.
                fileName = ruleNode.args[1];
            } else {
                fileName = ruleNode.args[0];
            }

            if (!fileName.value || /@/.test(fileName.value)) {
                return null;
            }

            return fileName.value;
        }

        private getImportInfo(ruleNode: Less.CallNode): { ruleNode: Less.CallNode, importedFile?: string, entryPath?: string } {
            if (ruleNode.name !== 'data-uri' ||
                ruleNode.args.length === 0) {
                return { ruleNode };
            }

            const importedFile = this.tryGetImportedFileName(ruleNode);

            if (!importedFile) {
                return { ruleNode };
            }

            const entryPath = ruleNode.currentFileInfo.entryPath;

            return { ruleNode, importedFile, entryPath };
        }

        public visitCall(callNode: Less.CallNode, visitArgs: any) {
            const { ruleNode, importedFile, entryPath } = this.getImportInfo(callNode);

            if (!importedFile) {
                return ruleNode;
            }

            this._imports.push({ directory: entryPath ? path.normalize(entryPath) : '', relativePath: importedFile });

            return ruleNode;
        }

        public get imports(): Import[] {
            return this._imports;
        }
    }
}

export = dataUriVisitor;