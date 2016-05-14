'use strict';

var chai = require('chai');
var File = require('vinyl');
var FakeFs = require('fake-fs');
var Promise = require('bluebird');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var crypto = require('crypto');
var path = require('path');

chai.use(sinonChai);

const expect = chai.expect;

function getImportBuffer(options) {
    options = options || {};
    let fsStub = options.fs || new FakeFs();
    let osStub = options.os || { tmpdir: () => 'temp' };
    let mkdirpStub = options.mkdirp || ((path, done) => { done(); });
    let importBuffer = proxyquire('../release/import-buffer', { 'fs': fsStub, 'os': osStub, 'mkdirp': mkdirpStub });
    return importBuffer.ImportBuffer;
}

class FakeImportLister {
    constructor(fs, files) {
        this.fs = fs;
        this.files = files;
    }

    changeImportsTo(files) {
        this.files = files;
    }

    listImports(file) {
        let statAsync = Promise.promisify(this.fs.stat);
        return Promise.map(this.files, file => {
            return statAsync.call(this.fs, file).then(stat => {
                return { path: file, time: stat.mtime.getTime() };
            });
        });
    }
};

describe('import-buffer', () => {
    describe('when creating an instance', () => {
        let ImportBuffer;
        beforeEach(() => {
            ImportBuffer = getImportBuffer();
        });

        [{ name: 'null', value: null }, { name: 'undefined', value: undefined }, { name: 'invalid', value: 123 }].map(item => {
            it(`should throw if created with ${item.name} importer`, () => {
                expect(() => new ImportBuffer(item.value, 'xxx')).to.throw('Invalid importer.');
            });
        });

        it('should throw is created without a buffer key', () => {
            expect(() => new ImportBuffer(() => Promise.resolve([]))).to.throw('A buffer key is required.');
        });
    });

    describe('when there are existing imports', () => {
        let ImportBuffer;
        let fsStub;
        let mkdirpStub;
        const tempDir = 'temp/dir';
        const bufferKey = 'somerandombufferkey';

        let date1;
        let date2;

        let mainFile;
        let fakeImportLister;
        let buffer;

        let spyContext;

        beforeEach(() => {
            spyContext = sinon.sandbox.create();
            mkdirpStub = spyContext.stub().callsArg(1);

            date1 = new Date();
            date2 = new Date();
            date2.setDate(date1.getDate() + 1);

            fsStub = new FakeFs();
            fsStub.file('import1.less', { mtime: date1 });
            fsStub.file('import2.less', { mtime: date2 });

            mainFile = new File({ path: 'main.less' });

            ImportBuffer = getImportBuffer({ fs: fsStub, os: { tmpdir: () => tempDir }, mkdirp: mkdirpStub });

            fakeImportLister = new FakeImportLister(fsStub, ['import1.less', 'import2.less']);
            buffer = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister), bufferKey);
        });

        afterEach(() => {
            sinon.sandbox.restore();
        });

        it('should provide stats for existing imports', () => {
            return buffer.listImports(mainFile)
                .then(imports => {
                    let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                    expect(transformedImports)
                        .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                            { path: 'import2.less', time: date2.getTime() }]);
                });
        });

        it('should serialise list of imports to disk', () => {
            spyContext.spy(fsStub, 'writeFile');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(mkdirpStub).to.have.been.calledWith(serialiseDir, sinon.match.func);
                    let importContents = JSON.stringify(imports);
                    expect(fsStub.writeFile).to.have.been.calledWith(tempFilePath, importContents);
                });
        });

        it('should log error to console if serialised file cannot be written', () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            spyContext.stub(fsStub, 'writeFile').throws(new Error('Something went wrong.'));

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(console.error).to.have.been.calledWith(`Failed to cache results to '${tempFilePath}'. Error: Something went wrong.`);
                });
        });

        it('should log error to console if temporary path cannot be created', () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            mkdirpStub.callsArgWith(1, new Error('Something went wrong.'));

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(console.error).to.have.been.calledWith(`Failed to cache results to '${tempFilePath}'. Error: Something went wrong.`);
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
                            let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                                    { path: 'import2.less', time: date2.getTime() }]);
                        });
                });
        });

        it('should call original importer again if modified times have not changed but using instance with different buffer key', () => {
            return buffer.listImports(mainFile)
                .then(() => {
                    fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
                    fsStub.file('import3.less', { mtime: date1 });
                    fsStub.file('import4.less', { mtime: date2 });
                    let buffer2 = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister), 'some different key');

                    return buffer2.listImports(mainFile)
                        .then(imports => {
                            let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                                    { path: 'import4.less', time: date2.getTime() }]);
                        });
                });
        });

        it('should not call original importer again if modified times have not changed when using instance with same buffer key', () => {
            return buffer.listImports(mainFile)
                .then(() => {
                    // the importer returns different files but we shouldn't call it again because the modified times
                    // haven't changed
                    fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
                    let buffer2 = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister), bufferKey);

                    return buffer2.listImports(mainFile)
                        .then(imports => {
                            let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                                    { path: 'import2.less', time: date2.getTime() }]);
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
                            let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                                    { path: 'import4.less', time: date2.getTime() }]);
                        });
                });
        });

        it('should not call original importer if serialised modified times have not changed', () => {
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));

            let serialisedImports = [{ path: 'import1.less', time: date1.getTime() }, { path: 'import2.less', time: date2.getTime() }];
            spyContext.stub(fsStub, 'readFile', (path, done) => done(null, JSON.stringify(serialisedImports)));

            // the importer returns different files but we shouldn't call it again because the modified times
            // haven't changed
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);

            return buffer.listImports(mainFile)
                .then(imports => {
                    let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                    expect(transformedImports)
                        .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                            { path: 'import2.less', time: date2.getTime() }]);
                });
        });

        it('should log error to console if serialised file cannot be read', () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            spyContext.stub(fsStub, 'readFile').throws(new Error('Something went wrong.'));

            return buffer.listImports(mainFile)
                .then(imports => {
                    expect(console.error).to.have.been.calledWith(`Failed to load cached results from '${tempFilePath}'. Error: Something went wrong.`);
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
                            let transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
                            expect(transformedImports)
                                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                                    { path: 'import4.less', time: date2.getTime() }]);
                        });
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