'use strict';

var chai = require('chai');
var File = require('vinyl');
var FakeFs = require('fake-fs');
var Promise = require('bluebird');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();

const expect = chai.expect;

var getImportBuffer = function(fs) {
    let fsStub = fs || new FakeFs();
    let importBuffer = proxyquire('../release/import-buffer', { 'fs': fsStub });
    return importBuffer.ImportBuffer;
};

class FakeImportLister {
    constructor(files) {
        this.files = files;
    }

    changeImportsTo(files) {
        this.files = files;
    }

    listImports(file) {
        return Promise.resolve(this.files);
    }
};

describe('import-buffer', () => {
    let ImportBuffer;
    beforeEach(() => {
        ImportBuffer = getImportBuffer();
    });

    [{ name: 'null', value: null }, { name: 'undefined', value: undefined }, { name: 'invalid', value: 123 }].map(item => {
        it(`should throw if created with ${item.name} importer`, () => {
            expect(() => new ImportBuffer(item.value)).to.throw(Error);
        });
    })

    describe('when there are existing imports', () => {
        let fsStub = new FakeFs();

        let date1;
        let date2;

        let mainFile;
        let fakeImportLister;
        let buffer;

        beforeEach(() => {
            ImportBuffer = getImportBuffer(fsStub);

            date1 = new Date();
            date2 = new Date();
            date2.setDate(date1.getDate() + 1);
            fsStub.file('import1.less', { mtime: date1 });
            fsStub.file('import2.less', { mtime: date2 });

            mainFile = new File({ path: 'main.less' });
            fakeImportLister = new FakeImportLister(['import1.less', 'import2.less']);
            buffer = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister));
        });

        it('should provide stats for existing imports', () => {
            return buffer.listImports(mainFile)
                .then(imports => {
                    let transformedImports = imports.map(i => { return { path: i.path, stat: { mtime: i.stat.mtime } } }).sort();
                    expect(transformedImports)
                        .to.deep.equal([{ path: 'import1.less', stat: { mtime: date1 } },
                            { path: 'import2.less', stat: { mtime: date2 } }]);
                });
        });

        it('should not call original importer again if modified times have not changed', () => {
            return buffer.listImports(mainFile)
                .then(() => {
                    // the importer returns different files but we shouldn't call it again because the modified times
                    // haven't changed
                    fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);

                    return buffer.listImports(mainFile)
                        .then(imports => {
                            let transformedImports = imports.map(i => { return { path: i.path, stat: { mtime: i.stat.mtime } } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import1.less', stat: { mtime: date1 } },
                                    { path: 'import2.less', stat: { mtime: date2 } }]);
                        });
                });
        });

        it('should call original importer again if modified times have changed', () => {
            return buffer.listImports(mainFile)
                .then(() => {
                    fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
                    fsStub.file('import3.less', { mtime: date1 });
                    fsStub.file('import4.less', { mtime: date2 });

                    // import changes...
                    fsStub.file('import2.less', { mtime: new Date() });

                    return buffer.listImports(mainFile)
                        .then(imports => {
                            let transformedImports = imports.map(i => { return { path: i.path, stat: { mtime: i.stat.mtime } } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import3.less', stat: { mtime: date1 } },
                                    { path: 'import4.less', stat: { mtime: date2 } }]);
                        });
                });
        });
    });
});