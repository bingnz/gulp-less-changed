import { DataUriVisitor, Import } from "./data-uri-visitor";

export class DataUriVisitorPlugin {
  private dataUriVisitor: DataUriVisitor;

  public install(
    lessLocal: Less.LessStaticExtensions,
    pluginManager: any,
  ): void {
    this.dataUriVisitor = new DataUriVisitor(lessLocal);
    pluginManager.addVisitor(this.dataUriVisitor);
  }

  public get imports(): Import[] {
    return this.dataUriVisitor ? this.dataUriVisitor.imports : [];
  }
}
