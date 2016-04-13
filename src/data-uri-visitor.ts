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

            this._imports.push({ directory: ruleNode.currentFileInfo.entryPath, relativePath: importedFile });

            return ruleNode;

        }

        public get imports(): Import[] {
            return this._imports;
        }
    }
}

export = dataUriVisitor;