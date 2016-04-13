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

            if (ruleNode.args.length === 0) {
                return ruleNode;
            }

            let argument: any;

            if (ruleNode.args.length === 2) { // specifying MIME type.
                argument = ruleNode.args[1];
            } else {
                argument = ruleNode.args[0];
            }

            let importedFile = argument.value[0].value;
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