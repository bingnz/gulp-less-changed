'use strict';

var chai = require('chai');
var File = require('vinyl');
var fs = require('fs');
var path = require('path');
var process = require('process');
var through = require('through2');
var Promise = require('bluebird');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();

const fsAsync = Promise.promisifyAll(fs);

chai.use(sinonChai);
const expect = chai.expect;

function getImportLister(options) {
    options = options || {};
    let importBufferStub = options.importBuffer || {
        'ImportBuffer': function (lister) {
            return {
                'listImports': inputFile =>
                    lister(inputFile).then(files =>
                        Promise.map(files, file =>
                            fsAsync.statAsync(file).then(stat => {
                                return { path: file, stat: stat } })))}}};

    let proxies = { './import-buffer': importBufferStub };
    let lessStub = options.less;
    if (lessStub) {
        proxies['less'] = lessStub;
    }

    let resolverStub = options.pathResolver;
    if (resolverStub) {
        proxies['./path-resolver'] = resolverStub;
    }

    let listImports = proxyquire('../release/import-lister', proxies);
    return listImports.ImportLister;
}

function readFile(file) {
    return fsAsync.readFileAsync(file.path)
            .then(data => {
                file.contents = data;
                return file;
            });
}

function toBytes(data, enc, callback) {
    this.emit('data', new Uint8Array(data));
    callback(null, null);
}

function readFileAsStream(file, type) {
    return new Promise((resolve, reject) => {
        let stream = fs.createReadStream(file.path, { autoClose: true });
        if (type === 'byte') {
            stream = stream.pipe(through(toBytes));
        }
        file.contents = stream;
        process.nextTick(() => resolve(file));
    });
}

describe('import-lister', () => {
    let importLister;
    beforeEach(() => {
        importLister = new (getImportLister());
    });

    describe('when passing in a null file', () => {
        it('should return an empty list of imports', () => {
            return importLister.listImports(null)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in an unresolved file', () => {
        it('should return an empty list of imports', () => {
            return importLister.listImports(new File({ path: 'nofile.less' }))
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in an empty file', () => {
        let fakeFile = new File({ path: 'something.less', contents: new Buffer('') });
        it('should return an empty list of imports', () => {
            return importLister.listImports(fakeFile)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in a file with an import that can\'t be found', () => {
        let fakeFile = new File({ path: 'something.less', contents: new Buffer('@import "file2.less";') });
        it('should throw an error', () => {
            return importLister.listImports(fakeFile)
                .then(importList => expect.fail(0, 1, 'should have thrown an error.'))
                .catch(error => expect(error.message).to.contain('Failed to process imports for '));
        });
    });

    describe('when passing in a file with an import', () => {
        const filePath = './test/list-imports-cases/file-with-import/file.less';
        it('should return the single import', () => {
            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-import!import.less']));
        });
    });

    describe('when passing in a file with a function call', () => {
        const filePath = './test/list-imports-cases/file-with-function-call/file.less';
        it('should return no imports', () => {
            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in a file with recursive imports', () => {
        const filePath = './test/list-imports-cases/file-with-recursive-imports/file.less';
        it('should return the imports', () => {
            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.sort().map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-recursive-imports!import1.less',
                    'test!list-imports-cases!file-with-recursive-imports!import2.less'
                ]));
        });
    });

    describe('when passing in a file with a data-uri', () => {
        const filePath = './test/list-imports-cases/file-with-data-uri/file.less';
        it('should return the referenced image as an import', () => {
            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-data-uri!image.svg']));
        });

        it('should use the path resolver to resolve the import file', () => {
            const resolvedPath = 'some/path/image.svg';
            let resolverFunction = {
                resolve: function() {
                    return Promise.resolve(resolvedPath);
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            sinon.spy(resolverFunction, 'resolve');
            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }));

            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => {
                    expect(importList.map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                        resolvedPath.replace(new RegExp(path.sep, 'g'), '!')]);
                    expect(resolverFunction.resolve).to.have.been.calledWith('test/list-imports-cases/file-with-data-uri/image.svg'.replace(/\//g, path.sep));
                });
        });

        it('should keep absolute path for import files', () => {
            const relativePath = 'some/path/image.svg';
            let absolutePath = path.join(process.cwd(), relativePath);
            let resolverFunction = {
                resolve: function() {
                    return Promise.resolve(absolutePath);
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            sinon.spy(resolverFunction, 'resolve');

            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }));

            return importLister.listImports(new File({ path: 'x', contents: new Buffer(`@a: data-uri('${absolutePath}');`) }))
                .then(importList => {
                    expect(resolverFunction.resolve).to.have.been.calledWith(absolutePath.replace(/\//g, path.sep));
                });
        });

        it('should not return import if an error occurs in the path resolution', () => {
            let resolverFunction = {
                resolve: function() {
                    return Promise.reject(new Error('Some error'));
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            sinon.spy(resolverFunction, 'resolve');
            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }));

            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(() => expect.fail(1, 0, 'Should have thrown an error.'))
                .catch(error => {
                    expect(error.message).to.contain('Error: Some error');
                });
        });

        it('should pass provided paths to the path resolver', () => {
            const resolvedPath = 'some/path/image.svg';
            const path1 = 'pathA';
            const path2 = 'path/B';

            let resolverFunction = {
                resolve: function() {
                    return Promise.resolve(resolvedPath);
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            sinon.spy(resolverFunction, 'resolve');
            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }))({ paths: [path1, path2] });

            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => {
                    expect(resolverFunction.resolve).to.have.been.calledWith(sinon.match.string, [path1, path2]);
                });
        });
    });

    describe('when passing in a file with a data-uri with MIME type and import by reference', () => {
        const filePath = './test/list-imports-cases/file-with-data-uri-mime-type/file.less';
        it('should return the referenced image and file as imports', () => {
            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.map(x => x.path).sort().map(x => x.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-data-uri-mime-type!image.svg',
                    'test!list-imports-cases!file-with-data-uri-mime-type!x.less']));
        });
    });

    describe('when passing in a file as a buffered stream', () => {
        const filePath = './test/list-imports-cases/file-with-recursive-imports/file.less';
        it('should return the imports', () => {
            return readFileAsStream(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.map(x => x.path).sort().map(x => x.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-recursive-imports!import1.less',
                    'test!list-imports-cases!file-with-recursive-imports!import2.less'
                ]));
        });
    });
    
    describe('when passing in a file as a byte stream', () => {
        const filePath = './test/list-imports-cases/file-with-recursive-imports/file.less';
        it('should return the imports', () => {
            return readFileAsStream(new File({ path: filePath }), 'byte')
                .then(f => importLister.listImports(f))
                .then(importList => expect(importList.sort().map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-recursive-imports!import1.less',
                    'test!list-imports-cases!file-with-recursive-imports!import2.less'
                ]));
        });
    });

    describe('when paths are specified', () => {
        const filePath = './test/list-imports-cases/file-with-import/file.less';
        it('should pass the paths to the less render function', () => {
            const path1 = 'a/b/c';
            const path2 = 'd/e/f';
            const path3 = 'g/h/i';

            let lessStub = { render: () => Promise.resolve({ imports: [] }) };
            sinon.spy(lessStub, 'render');

            importLister = new (getImportLister({ less: lessStub }))({ paths: [path1, path2, path3] });

            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(() => expect(lessStub.render).to.have.been.calledWith(sinon.match.string, sinon.match({ 'paths': [path1, path2, path3] })));
        });

        it('should not alter paths array', () => {
            const path1 = 'a/b/c';
            const path2 = 'd/e/f';
            const path3 = 'g/h/i';

            let lessStub = { render: () => Promise.resolve({ imports: [] }) };

            let paths = [path1, path2, path3];
            importLister = new (getImportLister({ less: lessStub }))({ paths: paths });

            let file = new File({ path: filePath, contents: new Buffer('fake') });
            return importLister.listImports(file)
                .then(() => expect(paths).to.deep.equal([path1, path2, path3]));
        });
    });

    it('should create import buffer only once', () => {
        const path1 = 'a/b/c';
        const path2 = 'd/e/f';
        const path3 = 'g/h/i';

        let importBufferStub = {
            'ImportBuffer': function (lister) {
                return {
                    'listImports': inputFile =>
                        lister(inputFile).then(files =>
                            Promise.map(files, file =>
                                Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

        let lessStub = { render: () => Promise.resolve({ imports: ['something.less'] }) };

        sinon.spy(importBufferStub, 'ImportBuffer');

        let paths = [path1, path2, path3];
        importLister = new (getImportLister({ importBuffer: importBufferStub, less: lessStub }))({ paths: paths });
 
        let fileA = new File({ path: 'filePathA', contents: new Buffer('fake') });
        let fileB = new File({ path: 'filePathB', contents: new Buffer('fake') });
        return importLister.listImports(fileA)
            .then(() => importLister.listImports(fileB))
            .then(() => expect(importBufferStub.ImportBuffer).to.have.been.calledOnce);
    });

    describe('when options are specified', () => {
        it('should pass the original options to the less render function', () => {
            let lessStub = { render: () => Promise.resolve({ imports: [] }) };
            sinon.spy(lessStub, 'render');

            importLister = new (getImportLister({ less: lessStub }))({ some: 'option' });

            let fakeFile = new File({ path: 'something.less', contents: new Buffer('') });
            return importLister.listImports(fakeFile)
                .then(() => expect(lessStub.render).to.have.been.calledWith(sinon.match.string, sinon.match({ some: 'option' })));
        });

        it('should pass specified plugins to the less render function', () => {
            let lessStub = { render: () => Promise.resolve({ imports: [] }) };
            let renderSpy = sinon.spy(lessStub, 'render');

            let myPlugin = { install: function() { } };
            importLister = new (getImportLister({ less: lessStub }))({ some: 'option', plugins: [myPlugin] });

            let fakeFile = new File({ path: 'something.less', contents: new Buffer('') });
            return importLister.listImports(fakeFile)
                .then(() => {
                    let plugins = renderSpy.getCall(0).args[1].plugins;
                    expect(plugins).to.include(myPlugin);
                });
        });

        it('should still process data-uri correctly when passing specified plugins to the less render function', () => {
            let resolverFunction = {
                resolve: function(file) {
                    return Promise.resolve(file);
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            let myPlugin = { install: function() { } };
            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }))({ some: 'option', plugins: [myPlugin] });

            let fakeFile = new File({ path: 'something.less', contents: new Buffer('@x: data-uri("file.png");') });
            return importLister.listImports(fakeFile)
                .then(imports => {
                    expect(imports.map(i => i.path)).to.deep.equal(['file.png']);
                });
        });

        it('should use options correctly in the less evaluator', () => {
            const importPath = './test/list-imports-cases/@{myVar}/file.less';

            let resolverFunction = {
                resolve: function(file) {
                    return Promise.resolve(file);
                }
            };

            let pathResolver = {
                PathResolver: function()
                {
                    return resolverFunction;
                } 
            };
            let importBufferStub = {
                'ImportBuffer': function (lister) {
                    return {
                        'listImports': inputFile =>
                            lister(inputFile).then(files =>
                                Promise.map(files, file =>
                                    Promise.resolve({ path: file, stat: { mtime: new Date() } })))}}};

            importLister = new (getImportLister({ pathResolver: pathResolver, importBuffer: importBufferStub }))({ globalVars: { myVar: 'file-with-import' } });

            let fakeFile = new File({ path: 'something.less', contents: new Buffer(`@import '${importPath}';`) });
            return importLister.listImports(fakeFile)
                .then(importList => expect(importList.map(x => x.path.split(path.sep).join('!'))).to.include(
                    '.!test!list-imports-cases!file-with-import!file.less'));
        });

        it('should not alter original options', () => {
            let lessStub = { render: () => Promise.resolve({ imports: [] }) };
            sinon.spy(lessStub, 'render');

            let options = { a: 'b', c: 'd' };
            importLister = new (getImportLister({ less: lessStub }))(options);

            let fakeFile = new File({ path: 'something.less', contents: new Buffer('') });

            return importLister.listImports(fakeFile)
                .then(() => expect(options).to.deep.equal({ a: 'b', c: 'd' }));
        });
    });
});