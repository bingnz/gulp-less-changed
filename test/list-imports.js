'use strict';

var chai = require('chai');
var File = require('vinyl');
var q = require('q');
var fs = require('fs');
var path = require('path');
var process = require('process');
var through = require('through2');
var Promise = require('bluebird');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();

const fsAsync = Promise.promisifyAll(fs);

const expect = chai.expect;

var getListImports = function() {
    let importBufferStub = {
        'ImportBuffer': function (lister) {
            return {
                'listImports': inputFile =>
                    lister(inputFile).then(files =>
                        Promise.map(files, file =>
                            fsAsync.statAsync(file).then(stat => {
                                return { path: file, stat: stat } })))}}};

    let lessChanged = proxyquire('../release/list-imports', { './import-buffer': importBufferStub });
    return lessChanged;
};

function readFile(file) {
    return new Promise((resolve, reject) => {
        q.nfcall(fs.readFile.bind(fs), file.path)
            .then(data => {
                file.contents = data;
                resolve(file);
            }, reason => {
                reject(reason);
            });
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

describe('list-imports', () => {
    let listImports;
    beforeEach(() => {
        listImports = getListImports().listImports;
    });

    describe('when passing in a null file', () => {
        it('should return an empty list of imports', () => {
            return listImports(null)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in an unresolved file', () => {
        it('should return an empty list of imports', () => {
            return listImports(new File({ path: 'nofile.less' }))
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in an empty file', () => {
        let fakeFile = new File({ path: 'something.less', contents: new Buffer('') });
        it('should return an empty list of imports', () => {
            return listImports(fakeFile)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in a file with an import that can\'t be found', () => {
        let fakeFile = new File({ path: 'something.less', contents: new Buffer('@import "file2.less";') });
        it('should return the single import', () => {
            return listImports(fakeFile)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in a file with an import', () => {
        const filePath = './test/list-imports-cases/file-with-import/file.less';
        it('should return the single import', () => {
            return readFile(new File({ path: filePath }))
                .then(f => listImports(f))
                .then(importList => expect(importList.map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-import!import.less']));
        });
    });

    describe('when passing in a file with recursive imports', () => {
        const filePath = './test/list-imports-cases/file-with-recursive-imports/file.less';
        it('should return the imports', () => {
            return readFile(new File({ path: filePath }))
                .then(f => listImports(f))
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
                .then(f => listImports(f))
                .then(importList => expect(importList.map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-data-uri!image.svg']));
        });
    });

    describe('when passing in a file with a data-uri with MIME type and import by reference', () => {
        const filePath = './test/list-imports-cases/file-with-data-uri-mime-type/file.less';
        it('should return the referenced image and file as imports', () => {
            return readFile(new File({ path: filePath }))
                .then(f => listImports(f))
                .then(importList => expect(importList.map(x => x.path).sort().map(x => x.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-data-uri-mime-type!image.svg',
                    'test!list-imports-cases!file-with-data-uri-mime-type!x.less']));
        });
    });

    describe('when passing in a file as a buffered stream', () => {
        const filePath = './test/list-imports-cases/file-with-recursive-imports/file.less';
        it('should return the imports', () => {
            return readFileAsStream(new File({ path: filePath }))
                .then(f => listImports(f))
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
                .then(f => listImports(f))
                .then(importList => expect(importList.sort().map(x => x.path.split(path.sep).join('!'))).to.deep.equal([
                    'test!list-imports-cases!file-with-recursive-imports!import1.less',
                    'test!list-imports-cases!file-with-recursive-imports!import2.less'
                ]));
        });
    });
});