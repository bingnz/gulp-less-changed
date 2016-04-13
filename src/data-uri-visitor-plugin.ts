import * as path from 'path';
import { DataUriVisitor, Import } from './data-uri-visitor';

module dataUriVisitorPlugin {
    export class DataUriVisitorPlugin {
        private _dataUriVisitor: DataUriVisitor;

        public install(lessLocal: Less.LessStaticExtensions, pluginManager: any): void {
            this._dataUriVisitor = new DataUriVisitor(lessLocal);
            pluginManager.addVisitor(this._dataUriVisitor);
        }

        public get imports(): Import[] {
            return this._dataUriVisitor ? this._dataUriVisitor.imports : [];
        }
    }
}

export = dataUriVisitorPlugin;