// Minimal stand-in for the LensifyTS declarations that Lens Studio generates into
// <project>/Cache/TypeScript/lib/LensifyTS/Declarations. Only the component framework
// surface is declared here; every engine API comes from the official studio.d.ts.
// Script type names are branded so built-in names ("Component.Text", ...) still resolve
// through the official, precisely typed createComponent overload.
type ScriptTypeName = string & { readonly __scriptTypeName: true };
declare class BaseScriptComponent extends ScriptComponent {
  static getTypeName(): ScriptTypeName;
}
interface SceneObject {
  createComponent(typeName: ScriptTypeName): Component;
}
declare function component(...args: any[]): any;
declare function input(...args: any[]): any;
declare function allowUndefined(...args: any[]): any;
