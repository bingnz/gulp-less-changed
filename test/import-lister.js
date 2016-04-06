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

var getImportLister = function(options) {
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
    let listImports = proxyquire('../release/list-imports', proxies);
    return listImports.ImportLister;
};

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
        it('should return the single import', () => {
            return importLister.listImports(fakeFile)
                .then(importList => expect(importList).to.be.empty);
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

            importLister = new (getImportLister({ less: lessStub }))([path1, path2, path3]);

            return readFile(new File({ path: filePath }))
                .then(f => importLister.listImports(f))
                .then(() => expect(lessStub.render).to.have.been.calledWith(sinon.match.string, sinon.match({ 'paths': [path1, path2, path3] })));
        });

        it('should not alter paths array', () => {
            const path1 = 'a/b/c';
            const path2 = 'd/e/f';
            const path3 = 'g/h/i';

            let lessStub = { render: () => Promise.resolve({ imports: [] }) };
            sinon.spy(lessStub, 'render');

            let paths = [path1, path2, path3];
            importLister = new (getImportLister({ less: lessStub }))(paths);

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
        importLister = new (getImportLister({ importBuffer: importBufferStub, less: lessStub }))(paths);
 
        let fileA = new File({ path: 'filePathA', contents: new Buffer('fake') });
        let fileB = new File({ path: 'filePathB', contents: new Buffer('fake') });
        return importLister.listImports(fileA)
            .then(() => importLister.listImports(fileB))
            .then(() => expect(importBufferStub.ImportBuffer).to.have.been.calledOnce);
    });
});