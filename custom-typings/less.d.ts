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
        render(input: string, options: Options2): PromiseLike<Less.RenderOutput>;
    }

    interface Node {
        fileInfo?(): RootFileInfo;
        currentFileInfo?: RootFileInfo;

        name: string;
    }

    interface Arg {
        value: string;
    }

    interface CallNode extends Node {
        args: Arg[];
    }

    interface Visitor {
        new (implementation: any): Visitor;
        visit(node: Node): Node;
    }

    interface Visitors {
        Visitor: Visitor;
    }

    interface LessStaticExtensions extends LessStatic {
        functions: Functions;
        visitors: Visitors;
    }
}

