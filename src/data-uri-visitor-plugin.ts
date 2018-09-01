import { DataUriVisitor, Import } from "./data-uri-visitor";

export class DataUriVisitorPlugin {
    constructor(private importFound: (i: Import) => void) {}

    public install(
        lessLocal: Less.LessStaticExtensions,
        pluginManager: any
    ) {
        const visitor = new DataUriVisitor(lessLocal, this.importFound);
        pluginManager.addVisitor(visitor);
    }
}
