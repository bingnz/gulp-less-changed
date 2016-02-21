declare module Less {

    interface Options2 {
        sourceMap?: SourceMapOption;
        filename?: string;
        plugins?: Plugin[];
        rootFileInfo?: RootFileInfo;
    }

    interface FunctionRegistry {
        add: (name: string, fn: any) => void;
    }

    interface Functions {
        functionRegistry: FunctionRegistry;
    }

    interface LessStaticExtensions extends LessStatic {
        functions: Functions;
    }
}

