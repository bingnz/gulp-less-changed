import chai from "chai";
import File from "vinyl";
import FakeFs from "fake-fs";
import fs from "fs";
import path from "path";
import process from "process";
import through from "through2";
import Promise from "bluebird";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import sinonTest from "sinon-test";
import chaiAsPromised from "chai-as-promised";
import lessLatest from "less";
import less272 from "less@2.7.2";
import less304 from "less@3.0.4";

const proxyquire = require("proxyquire")
    .noPreserveCache()
    .noCallThru();

const fsAsync = Promise.promisifyAll(fs);

chai.use(sinonChai);
chai.use(chaiAsPromised);
sinon.test = sinonTest(sinon);

const expect = chai.expect;

function getImportListerCore(options) {
    options = options || {};

    const proxies = {};
    const lessStub = options.less;
    if (lessStub) {
        proxies["less"] = lessStub;
    }

    const fsStub = options.fs;
    if (fsStub) {
        proxies["fs"] = fsStub;
    }

    const resolverStub = options.pathResolver;
    if (resolverStub) {
        proxies["./path-resolver"] = resolverStub;
    }

    const listImports = proxyquire("../release/import-lister", proxies);
    return listImports.ImportLister;
}

async function readFile(path) {
    const data = await fsAsync.readFileAsync(path);
    return new File({ path: path, contents: data });
}

function toBytes(data, _, callback) {
    for (const byte of data.values()) {
        this.emit("data", String.fromCharCode(byte));
    }
    callback(null, null);
}

function readFileAsStream(path, type) {
    let stream = fs.createReadStream(path, { autoClose: true });
    if (type === "byte") {
        stream = stream.pipe(through(toBytes));
    }
    return new File({ path: path, contents: stream });
}

[
    { description: "when using latest version of less", version: lessLatest },
    { description: "when using less 2.7.2", version: less272 },
    { description: "when using less 3.0.4", version: less304 }
].map(less =>
    describe(`import-lister ${less.description} `, () => {
        let importLister;
        const getImportLister = options => {
            if (options && options.less) {
                delete options.less;
            }
            return getImportListerCore(
                Object.assign({ less: less.version }, options)
            );
        };

        beforeEach(() => {
            importLister = new (getImportLister())();
        });

        describe("when passing in a null file", () => {
            it("should return an empty list of imports", async () => {
                const importList = await importLister.listImports(null);
                expect(importList).to.be.empty;
            });
        });

        describe("when passing in an unresolved file", () => {
            it("should return an empty list of imports", async () => {
                const importList = await importLister.listImports(
                    new File({ path: "nofile.less" })
                );
                expect(importList).to.be.empty;
            });
        });

        describe("when passing in an empty file", () => {
            const fakeFile = new File({
                path: "something.less",
                contents: new Buffer("")
            });
            it("should return an empty list of imports", async () => {
                const importList = await importLister.listImports(fakeFile);
                expect(importList).to.be.empty;
            });
        });

        describe("when passing in a file with an import that can't be found", () => {
            const fakeFile = new File({
                path: "something.less",
                contents: new Buffer('@import "file2.less";')
            });
            it("should throw an error", async () => {
                await expect(
                    importLister.listImports(fakeFile)
                ).to.eventually.be.rejectedWith(
                    /Failed to process imports for '/
                );
            });
        });

        describe("when passing in a file with an import", () => {
            const filePath =
                "./test/list-imports-cases/file-with-import/file.less";
            it("should return the single import", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList.map(x => x.path.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-import!import.less"
                ]);
            });
        });

        describe("when passing in a file with a function call", () => {
            const filePath =
                "./test/list-imports-cases/file-with-function-call/file.less";
            it("should return no imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(importList).to.be.empty;
            });
        });

        describe("when passing in a file with recursive imports", () => {
            const filePath =
                "./test/list-imports-cases/file-with-recursive-imports/file.less";
            it("should return the imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList.sort().map(x => x.path.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-recursive-imports!import1.less",
                    "test!list-imports-cases!file-with-recursive-imports!import2.less"
                ]);
            });
        });

        describe("when passing in a file with a data-uri", () => {
            const filePath =
                "./test/list-imports-cases/file-with-data-uri/file.less";
            it("should return the referenced image as an import", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList.map(x => x.path.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-data-uri!image.svg"
                ]);
            });

            it("should use the path resolver to resolve the import file", () =>
                sinon.test(async () => {
                    const resolvedPath = "some/path/image.svg";
                    const resolverFunction = {
                        resolve: async () => resolvedPath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    const fsStub = new FakeFs();
                    fsStub.file(resolvedPath, { mtime: new Date() });

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fsStub
                    }))();

                    const f = await readFile(filePath);
                    const importList = await importLister.listImports(f);

                    expect(
                        importList.map(x => x.path.split(path.sep).join("!"))
                    ).to.deep.equal([resolvedPath.split(path.sep).join("!")]);
                    expect(resolverFunction.resolve).to.have.been.calledWith(
                        path.normalize(
                            "./test/list-imports-cases/file-with-data-uri/"
                        ),
                        "image.svg"
                    );
                }));

            it("should keep absolute path for import files", () =>
                sinon.test(async () => {
                    const relativePath = "some/path/image.svg";
                    const absolutePath = path.join(process.cwd(), relativePath);
                    const resolverFunction = {
                        resolve: async () => absolutePath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    const fsStub = new FakeFs();
                    fsStub.file(relativePath, { mtime: new Date() });
                    sinon.spy(resolverFunction, "resolve");

                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fsStub
                    }))();

                    await importLister.listImports(
                        new File({
                            path: "x",
                            contents: new Buffer(
                                `@a: data-uri('${absolutePath}');`
                            )
                        })
                    );
                    expect(resolverFunction.resolve).to.have.been.calledWith(
                        "",
                        absolutePath.replace(/\//g, path.sep)
                    );
                }));

            it("should not return import if an error occurs in the path resolution", () =>
                sinon.test(async () => {
                    const resolverFunction = {
                        resolve: async () => {
                            throw new Error("Some error");
                        }
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver
                    }))();

                    const f = await readFile(filePath);
                    await expect(
                        importLister.listImports(f)
                    ).to.eventually.be.rejectedWith(Error, /Some error/);
                }));

            it("should not return import if the import file does not exist", () =>
                sinon.test(async () => {
                    const resolverFunction = {
                        resolve: async () => filePath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    sinon.spy(resolverFunction, "resolve");
                    sinon.spy(console, "error");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: new FakeFs()
                    }))();

                    const f = await readFile(filePath);
                    const imports = await importLister.listImports(f);
                    expect(imports).to.be.empty;
                    expect(console.error).to.have.been.calledWith(
                        `Import '${filePath}' not found.`
                    );
                }));

            it(
                "should propagate unknown error during file resolution",
                sinon.test(async () => {
                    const resolverFunction = {
                        resolve: async () => filePath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    sinon.spy(resolverFunction, "resolve");
                    const fakeFs = new FakeFs();
                    sinon.stub(fakeFs, "stat").throws(new Error("bad"));
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fakeFs
                    }))();

                    const f = await readFile(filePath);
                    await expect(
                        importLister.listImports(f)
                    ).to.eventually.be.rejectedWith(/bad/);
                })
            );

            it(
                "should pass provided paths to the path resolver",
                sinon.test(async () => {
                    const resolvedPath = "some/path/image.svg";
                    const path1 = "pathA";
                    const path2 = "path/B";

                    const resolverFunction = {
                        resolve: async () => resolvedPath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    const fsStub = new FakeFs();
                    fsStub.file(resolvedPath, { mtime: new Date() });

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fsStub
                    }))({ paths: [path1, path2] });

                    const f = await readFile(filePath);
                    await importLister.listImports(f);
                    expect(resolverFunction.resolve).to.have.been.calledWith(
                        sinon.match.string,
                        sinon.match.string,
                        sinon.match.array.contains([path1, path2])
                    );
                })
            );
        });

        describe("when passing in a file with a data-uri with content in a subdirectory", () => {
            const filePath =
                "./test/list-imports-cases/file-with-data-uri-subdirectory/file.less";
            it("should return the referenced file and image as an imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList.map(x => x.path.split(path.sep).join("!")).sort()
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-data-uri-subdirectory!content!image.svg",
                    "test!list-imports-cases!file-with-data-uri-subdirectory!content!include.less"
                ]);
            });
        });

        describe("when passing in a file with a data-uri with MIME type and import by reference", () => {
            const filePath =
                "./test/list-imports-cases/file-with-data-uri-mime-type/file.less";
            it("should return the referenced image and file as imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList
                        .map(x => x.path)
                        .sort()
                        .map(x => x.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-data-uri-mime-type!image.svg",
                    "test!list-imports-cases!file-with-data-uri-mime-type!x.less"
                ]);
            });
        });

        describe("when passing in a file with a data-uri with a variable", () => {
            const filePath =
                "./test/list-imports-cases/file-with-data-uri-variable/file.less";
            it("should return no imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(importList).to.be.empty;
            });

            it(
                "should not use the path resolver",
                sinon.test(async () => {
                    const resolvedPath = "some/path/image.svg";
                    const resolverFunction = {
                        resolve: async () => resolvedPath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    const fsStub = new FakeFs();
                    fsStub.file(resolvedPath, { mtime: new Date() });

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fsStub
                    }))();

                    const f = await readFile(filePath);
                    const importList = await importLister.listImports(f);
                    expect(importList).to.be.empty;
                    expect(resolverFunction.resolve).not.to.have.been.called;
                })
            );
        });

        describe("when passing in a file with a data-uri with an interpolated variable", () => {
            const filePath =
                "./test/list-imports-cases/file-with-data-uri-interpolated-variable/file.less";
            it("should return no imports", async () => {
                const f = await readFile(filePath);
                const importList = await importLister.listImports(f);
                expect(importList).to.be.empty;
            });

            it(
                "should not use the path resolver",
                sinon.test(async () => {
                    const resolvedPath = "some/path/image.svg";
                    const resolverFunction = {
                        resolve: async () => resolvedPath
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    const fsStub = new FakeFs();
                    fsStub.file(resolvedPath, { mtime: new Date() });

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver,
                        fs: fsStub
                    }))();

                    const f = await readFile(filePath);
                    const importList = await importLister.listImports(f);
                    expect(importList).to.be.empty;
                    expect(resolverFunction.resolve).not.to.have.been.called;
                })
            );
        });

        describe("when passing in a file as a buffered stream", () => {
            const filePath =
                "./test/list-imports-cases/file-with-recursive-imports/file.less";
            it("should return the imports", async () => {
                const f = readFileAsStream(filePath);
                const importList = await importLister.listImports(f);
                expect(
                    importList
                        .map(x => x.path)
                        .sort()
                        .map(x => x.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-recursive-imports!import1.less",
                    "test!list-imports-cases!file-with-recursive-imports!import2.less"
                ]);
            });
        });

        describe("when passing in a file as a byte stream", () => {
            const filePath =
                "./test/list-imports-cases/file-with-recursive-imports/file.less";
            it("should return the imports", async () => {
                const f = readFileAsStream(
                    filePath,
                    "byte"
                );
                const importList = await importLister.listImports(f);
                expect(
                    importList.sort().map(x => x.path.split(path.sep).join("!"))
                ).to.deep.equal([
                    "test!list-imports-cases!file-with-recursive-imports!import1.less",
                    "test!list-imports-cases!file-with-recursive-imports!import2.less"
                ]);
            });
        });

        describe("when options are specified", () => {
            it("should still process data-uri correctly when passing specified plugins to the less render function", async () => {
                const resolverFunction = {
                    resolve: async (_, file) => file
                };

                const pathResolver = {
                    PathResolver: function() {
                        return resolverFunction;
                    }
                };

                const fsStub = new FakeFs();
                fsStub.file("file.png", { mtime: new Date() });

                const myPlugin = { install: function() {} };
                importLister = new (getImportLister({
                    pathResolver: pathResolver,
                    fs: fsStub
                }))({ some: "option", plugins: [myPlugin] });

                const fakeFile = new File({
                    path: "something.less",
                    contents: new Buffer('@x: data-uri("file.png");')
                });
                const imports = await importLister.listImports(fakeFile);
                expect(imports.map(i => i.path)).to.deep.equal(["file.png"]);
            });

            it("should use options correctly in the less evaluator", async () => {
                const importPath =
                    "./test/list-imports-cases/@{myVar}/file.less";

                const resolverFunction = {
                    resolve: async (_, file) => file
                };

                const pathResolver = {
                    PathResolver: function() {
                        return resolverFunction;
                    }
                };

                importLister = new (getImportLister({
                    pathResolver: pathResolver
                }))({
                    globalVars: { myVar: "file-with-import" }
                });

                const fakeFile = new File({
                    path: "something.less",
                    contents: new Buffer(`@import '${importPath}';`)
                });
                const importList = await importLister.listImports(fakeFile);
                expect(importList.map(i => i.path)).to.include(
                    "./test/list-imports-cases/file-with-import/file.less"
                );
            });
        });

        describe("when a data-uri call is invalid", () => {
            it(
                "should throw an error",
                sinon.test(async () => {
                    const resolverFunction = {
                        resolve: async (_, file) => file
                    };

                    const pathResolver = {
                        PathResolver: function() {
                            return resolverFunction;
                        }
                    };

                    sinon.spy(resolverFunction, "resolve");
                    importLister = new (getImportLister({
                        pathResolver: pathResolver
                    }))();

                    await expect(
                        importLister.listImports(
                            new File({
                                path: "x",
                                contents: new Buffer("@a: data-uri();")
                            })
                        )
                    ).to.eventually.be.rejectedWith(
                        /Failed to process imports/
                    );
                })
            );
        });
    })
);

describe("when options are specified", () => {
    it(
        "should pass the original options to the less render function",
        sinon.test(async () => {
            const lessStub = {
                render: async () => {
                    return { imports: [] };
                }
            };
            sinon.spy(lessStub, "render");

            const importLister = new (getImportListerCore({ less: lessStub }))({
                some: "option"
            });

            const fakeFile = new File({
                path: "something.less",
                contents: new Buffer("")
            });
            await importLister.listImports(fakeFile);
            expect(lessStub.render).to.have.been.calledWith(
                sinon.match.string,
                sinon.match({ some: "option" })
            );
        })
    );

    it(
        "should pass specified plugins to the less render function",
        sinon.test(async () => {
            const lessStub = {
                render: async () => {
                    return { imports: [] };
                }
            };
            const renderSpy = sinon.spy(lessStub, "render");

            const myPlugin = { install: function() {} };
            const importLister = new (getImportListerCore({ less: lessStub }))({
                some: "option",
                plugins: [myPlugin]
            });

            const fakeFile = new File({
                path: "something.less",
                contents: new Buffer("")
            });
            await importLister.listImports(fakeFile);
            const plugins = renderSpy.getCall(0).args[1].plugins;
            expect(plugins).to.include(myPlugin);
        })
    );

    it(
        "should not alter original options",
        sinon.test(async () => {
            const lessStub = {
                render: async () => {
                    return { imports: [] };
                }
            };
            sinon.spy(lessStub, "render");

            const options = { a: "b", c: "d" };
            const importLister = new (getImportListerCore({ less: lessStub }))(
                options
            );

            const fakeFile = new File({
                path: "something.less",
                contents: new Buffer("")
            });

            await importLister.listImports(fakeFile);
            expect(options).to.deep.equal({ a: "b", c: "d" });
        })
    );
});

describe("when paths are specified", () => {
    const filePath = "./test/list-imports-cases/file-with-import/file.less";
    it(
        "should pass the paths to the less render function",
        sinon.test(async () => {
            const path1 = "a/b/c";
            const path2 = "d/e/f";
            const path3 = "g/h/i";

            const lessStub = {
                render: async () => {
                    return { imports: [] };
                }
            };
            sinon.spy(lessStub, "render");

            const importLister = new (getImportListerCore({ less: lessStub }))({
                paths: [path1, path2, path3]
            });

            const f = await readFile(filePath);
            await importLister.listImports(f);
            expect(lessStub.render).to.have.been.calledWith(
                sinon.match.string,
                sinon.match({ paths: [path1, path2, path3] })
            );
        })
    );

    it("should not alter paths array", async () => {
        const path1 = "a/b/c";
        const path2 = "d/e/f";
        const path3 = "g/h/i";

        const lessStub = {
            render: async () => {
                return { imports: [] };
            }
        };
        const paths = [path1, path2, path3];
        const importLister = new (getImportListerCore({ less: lessStub }))({
            paths: paths
        });

        const file = new File({ path: filePath, contents: new Buffer("fake") });
        await importLister.listImports(file);
        expect(paths).to.deep.equal([path1, path2, path3]);
    });
});
