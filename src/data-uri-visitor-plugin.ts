import * as path from 'path';
import { DataUriVisitor } from './data-uri-visitor';

module dataUriVisitorPlugin {
    export class DataUriVisitorPlugin {
        private _dataUriVisitor: DataUriVisitor;

        public install(lessLocal: Less.LessStaticExtensions, pluginManager: any): void {
            this._dataUriVisitor = new DataUriVisitor(lessLocal);
            pluginManager.addVisitor(this._dataUriVisitor);
        }

        public get imports(): string[] {
            return this._dataUriVisitor ? this._dataUriVisitor.imports : [];
        }
    }
}

export = dataUriVisitorPlugin;