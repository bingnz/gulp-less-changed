'use strict';

var chai = require('chai');
var File = require('vinyl');
var FakeFs = require('fake-fs');
var Promise = require('bluebird');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.use(sinonChai);

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

        let spyContext;

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

            spyContext = sinon.sandbox.create();
        });

        afterEach(() => {
            sinon.sandbox.restore();
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

        it('should call original importer again if import file is missing', () => {
            return buffer.listImports(mainFile)
                .then(() => {
                    fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
                    fsStub.file('import3.less', { mtime: date1 });
                    fsStub.file('import4.less', { mtime: date2 });

                    // import deleted...
                    fsStub.unlink('import2.less');

                    return buffer.listImports(mainFile)
                        .then(imports => {
                            let transformedImports = imports.map(i => { return { path: i.path, stat: { mtime: i.stat.mtime } } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import3.less', stat: { mtime: date1 } },
                                    { path: 'import4.less', stat: { mtime: date2 } }]);
                        });
                });
        });

        it('should omit import from list if not found', () => {
            fsStub.unlink('import1.less');
            return buffer.listImports(mainFile)
                .then(imports => {
                    let transformedImports = imports.map(i => { return { path: i.path, stat: { mtime: i.stat.mtime } } }).sort();
                    expect(transformedImports)
                        .to.deep.equal([{ path: 'import2.less', stat: { mtime: date2 } }]);
                });
        });

        it('should log error to console if import not found', () => {
            fsStub.unlink('import2.less');
            spyContext.spy(console, 'error');
            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(console.error).to.have.been.calledWith('Import \'import2.less\' not found.');
                });
        });

        it('should return no imports if unknown error occurs', () => {
            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            spyContext.stub(fsStub, 'stat').throws(fakeError);

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(imports).to.be.empty;
                });
        });

        it('should log error if unknown error occurs', () => {
            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            spyContext.stub(fsStub, 'stat').throws(fakeError);
            spyContext.spy(console, 'error');

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(console.error).to.have.been.calledWith('An unknown error occurred: Error: test');
                });
        });

        it('should not cache results if unknown error occurs', () => {
            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            let newSpyContext = sinon.sandbox.create();
            newSpyContext.stub(fsStub, 'stat').throws(fakeError);
            newSpyContext.spy(console, 'error');

            return buffer.listImports(mainFile)
                .then(imports => {
                    newSpyContext.restore();

                    return buffer.listImports(mainFile)
                        .then(imports => {
                            expect(imports).not.to.be.empty;
                        });
                });
        });
    });
});