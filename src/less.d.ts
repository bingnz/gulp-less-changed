declare module Less {

    interface Options2 {
        filename?: string;
        plugins?: Plugin[];
        paths?: string[];
    }

    interface FunctionRegistry {
        add: (name: string, fn: any) => void;
    }

    interface Functions {
        functionRegistry: FunctionRegistry;
    }

    interface RelaxedLessStatic {
        render(input: string, options: Options2): Promise<Less.RenderOutput>;
    }

    interface LessStaticExtensions extends LessStatic {
        functions: Functions;
    }
}

