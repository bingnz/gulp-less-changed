import chai from "chai";
import FakeFs from "fake-fs";
import path from "path";
import pmock from "pmock";
import sinonChai from "sinon-chai";
var proxyquire = require("proxyquire")
    .noPreserveCache()
    .noCallThru();

chai.use(sinonChai);
const expect = chai.expect;

function getPathResolver(options) {
    options = options || {};
    let fsStub = options.fs || new FakeFs();

    let proxies = {};
    proxies["fs"] = fsStub;

    let pathResolver = proxyquire("../release/path-resolver", proxies);
    return pathResolver;
}

describe("path-resolver", () => {
    let pathResolver;
    let fakeFs;
    let p;
    const currentDirectory = "current/directory";
    beforeEach(() => {
        fakeFs = new FakeFs();
        p = pmock.cwd(currentDirectory);
        let resolverModule = getPathResolver({ fs: fakeFs });
        pathResolver = new resolverModule.PathResolver();
    });

    afterEach(() => {
        p.reset();
    });

    describe("when paths are not specified", () => {
        it("should return path if file exists", async () => {
            const importPath = "this";
            const filePath = "file/exists.txt";
            fakeFs.file(path.join(importPath, filePath), {
                stat: { mtime: new Date() }
            });
            const resolved = await pathResolver.resolve(importPath, filePath);
            expect(resolved).to.equal(path.join(importPath, filePath));
        });

        it("should throw error if file doesn't exist", async () => {
            const filePath = "this/file/doesnot/exist.txt".replace(
                new RegExp("/", "g"),
                path.sep
            );
            try {
                await pathResolver.resolve("./", filePath);
                expect.fail(1, 0, "Should have thrown an error.");
            } catch (error) {
                expect(error.message).to.contain(
                    `Import file '${filePath}' wasn't found.`
                );
                expect(error.message).to.contain(`Tried: '${filePath}'`);
            }
        });

        it("should also try current directory", async () => {
            const fileName = "file.txt";
            const filePath = path.join("this/file", fileName);

            fakeFs.file(path.join(currentDirectory, filePath), {
                stat: { mtime: new Date() }
            });
            const resolved = await pathResolver.resolve("./", filePath);
            expect(resolved).to.equal(
                path.normalize(path.join(currentDirectory, filePath))
            );
        });
    });

    describe("when paths are specified", () => {
        it("should return path if file exists in one of the paths", async () => {
            const fileName = "exists.txt";
            const anotherPath = "another/Path";
            const thisPath = "this/path";
            const yetAnotherPath = "yetAnotherPath";

            fakeFs.file(path.join(thisPath, fileName), {
                stat: { mtime: new Date() }
            });
            const resolved = await pathResolver.resolve("./", fileName, [
                anotherPath,
                thisPath,
                yetAnotherPath
            ]);
            expect(resolved).to.equal(path.join(thisPath, fileName));
        });

        it("should throw error if file doesn't exist in any of the paths", async () => {
            const fileName = "it/is/missing.txt";
            const anotherPath = "another/Path";
            const yetAnotherPath = "yetAnotherPath";
            const currentDirectory = "some/path";

            try {
                await pathResolver.resolve(currentDirectory, fileName, [
                    anotherPath,
                    yetAnotherPath
                ]);
                expect.fail(1, 0, "Should have thrown an error.");
            } catch (error) {
                expect(error.message).to.contain(
                    `Import file '${fileName}' wasn't found.`
                );
                expect(error.message).to.contain(`'${fileName}'`);
                expect(error.message).to.contain(
                    `'${path.join(currentDirectory, fileName)}'`
                );
                expect(error.message).to.contain(
                    `'${path.join(anotherPath, fileName)}'`
                );
                expect(error.message).to.contain(
                    `'${path.join(yetAnotherPath, fileName)}'`
                );
            }
        });

        it("should also try current directory", async () => {
            const fileName = "file.txt";
            const filePath = path.join("this/file", fileName);

            fakeFs.file(path.join(currentDirectory, filePath), {
                stat: { mtime: new Date() }
            });
            const resolved = await pathResolver.resolve("./", filePath, [
                "bad1",
                "bad2"
            ]);
            expect(resolved).to.equal(path.join(currentDirectory, filePath));
        });
    });
});
