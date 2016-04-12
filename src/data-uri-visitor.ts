import * as less from 'less';
import * as path from 'path';

module dataUriVisitor {
    export class DataUriVisitor {
        public isReplacing = false;
        public isPreEvalVisitor = true;
        private _visitor: Less.Visitor;
        private _imports: string[] = [];

        constructor(less: Less.LessStaticExtensions) {
            this._visitor = new less.visitors.Visitor(this);
        }

        run(root: Less.Node) {
            return this._visitor.visit(root);
        }

        public visitCall(ruleNode: Less.CallNode, visitArgs: any) {

            if (ruleNode.name !== 'data-uri') {
                return ruleNode;
            }

            let importedFile: string;
            if (ruleNode.args.length === 2) { // specifying MIME type.
                importedFile = (<any>ruleNode.args[1]).value[0].value;
            } else {
                importedFile = (<any>ruleNode.args[0]).value[0].value;
            }

            var importPath = path.normalize(path.join(ruleNode.currentFileInfo.entryPath, importedFile));

            this._imports.push(importPath);

            return ruleNode;

        }

        public get imports(): string[] {
            return this._imports;
        }
    }
}

export = dataUriVisitor;