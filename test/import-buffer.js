'use strict';

import chai from 'chai';
import File from 'vinyl';
import FakeFs from 'fake-fs';
import Promise from 'bluebird';
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import crypto from 'crypto';
import path from 'path';

chai.use(sinonChai);

const expect = chai.expect;

function getImportBuffer(options) {
    options = options || {};
    const fsStub = options.fs || new FakeFs();
    const osStub = options.os || { tmpdir: () => 'temp' };
    const mkdirpStub = options.mkdirp || ((path, done) => { done(); });
    const importBuffer = proxyquire('../release/import-buffer', { 'fs': fsStub, 'os': osStub, 'mkdirp': mkdirpStub });
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
        const statAsync = Promise.promisify(this.fs.stat);
        return Promise.map(this.files, async file => {
            const stat = await statAsync.call(this.fs, file);
            return { path: file, time: stat.mtime.getTime() };
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
            spyContext = sinon.createSandbox();
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
            spyContext.restore();
        });

        it('should provide stats for existing imports', async () => {
            const imports = await buffer.listImports(mainFile);
            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                { path: 'import2.less', time: date2.getTime() }]);
        });

        it('should serialise list of imports to disk', async () => {
            spyContext.spy(fsStub, 'writeFile');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));

            const imports = await buffer.listImports(mainFile);
            expect(mkdirpStub).to.have.been.calledWith(serialiseDir, sinon.match.func);
            const importContents = JSON.stringify(imports);
            expect(fsStub.writeFile).to.have.been.calledWith(tempFilePath, importContents);
        });

        it('should log error to console if serialised file cannot be written', async () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            spyContext.stub(fsStub, 'writeFile').callsArgWith(2, new Error('Something went wrong.'));

            const imports = await buffer.listImports(mainFile);
            expect(console.error).to.have.been.calledWith(`Failed to cache results to '${tempFilePath}'. Error: Something went wrong.`);
        });

        it('should log error to console if temporary path cannot be created', async () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            mkdirpStub.callsArgWith(1, new Error('Something went wrong.'));

            const imports = await buffer.listImports(mainFile);
            expect(console.error).to.have.been.calledWith(`Failed to cache results to '${tempFilePath}'. Error: Something went wrong.`);
        });

        it('should not call original importer again if modified times have not changed', async () => {
            await buffer.listImports(mainFile);
            // the importer returns different files but we shouldn't call it again because the modified times
            // haven't changed
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);

            const imports = await buffer.listImports(mainFile);
            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                { path: 'import2.less', time: date2.getTime() }]);
        });

        it('should call original importer again if modified times have not changed but using instance with different buffer key', async () => {
            await buffer.listImports(mainFile);
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
            fsStub.file('import3.less', { mtime: date1 });
            fsStub.file('import4.less', { mtime: date2 });
            const buffer2 = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister), 'some different key');

            const imports = await buffer2.listImports(mainFile);
            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                { path: 'import4.less', time: date2.getTime() }]);
        });

        it('should not call original importer again if modified times have not changed when using instance with same buffer key', async () => {
            await buffer.listImports(mainFile);
            // the importer returns different files but we shouldn't call it again because the modified times
            // haven't changed
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
            const buffer2 = new ImportBuffer(fakeImportLister.listImports.bind(fakeImportLister), bufferKey);

            const imports = await buffer2.listImports(mainFile);

            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                { path: 'import2.less', time: date2.getTime() }]);
        });

        it('should call original importer again if modified times have changed', async () => {
            await buffer.listImports(mainFile);
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
            fsStub.file('import3.less', { mtime: date1 });
            fsStub.file('import4.less', { mtime: date2 });

            // import changes...
            fsStub.file('import2.less', { mtime: new Date() });

            const imports = await buffer.listImports(mainFile);

            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                { path: 'import4.less', time: date2.getTime() }]);
        });

        it('should not call original importer if serialised modified times have not changed', async () => {
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));

            const serialisedImports = [{ path: 'import1.less', time: date1.getTime() }, { path: 'import2.less', time: date2.getTime() }];
            spyContext.stub(fsStub, 'readFile').callsFake((path, done) => done(null, JSON.stringify(serialisedImports)));

            // the importer returns different files but we shouldn't call it again because the modified times
            // haven't changed
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);

            const imports = await buffer.listImports(mainFile);
            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import1.less', time: date1.getTime() },
                { path: 'import2.less', time: date2.getTime() }]);
        });

        it('should log error to console if serialised file cannot be read', async () => {
            spyContext.spy(console, 'error');
            const mainFileDir = crypto.createHash('md5').update(mainFile.path).digest('hex');
            const serialiseDir = path.join(tempDir, bufferKey);
            const tempFilePath = path.join(serialiseDir, mainFileDir + '_' + path.basename(mainFile.path));
            spyContext.stub(fsStub, 'readFile').throws(new Error('Something went wrong.'));

            const imports = await buffer.listImports(mainFile);
            expect(console.error).to.have.been.calledWith(`Failed to load cached results from '${tempFilePath}'. Error: Something went wrong.`);
        });

        it('should call original importer again if import file is missing', async () => {
            await buffer.listImports(mainFile);
            fakeImportLister.changeImportsTo(['import3.less', 'import4.less']);
            fsStub.file('import3.less', { mtime: date1 });
            fsStub.file('import4.less', { mtime: date2 });

            // import deleted...
            fsStub.unlink('import2.less');

            const imports = await buffer.listImports(mainFile);
            const transformedImports = imports.map(i => { return { path: i.path, time: i.time } }).sort();
            expect(transformedImports)
                .to.deep.equal([{ path: 'import3.less', time: date1.getTime() },
                { path: 'import4.less', time: date2.getTime() }]);
        });

        it('should return no imports if unknown error occurs', async () => {
            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            spyContext.stub(fsStub, 'stat').throws(fakeError);

            const imports = await buffer.listImports(mainFile);
            expect(imports).to.be.empty;
        });

        it('should log error if unknown error occurs', async () => {
            const fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            spyContext.stub(fsStub, 'stat').throws(fakeError);
            spyContext.spy(console, 'error');

            const imports = await buffer.listImports(mainFile);
            expect(console.error).to.have.been.calledWith('An unknown error occurred: Error: test');
        });

        it('should not cache results if unknown error occurs', async () => {
            const fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            const newSpyContext = sinon.createSandbox();
            newSpyContext.stub(fsStub, 'stat').throws(fakeError);
            newSpyContext.spy(console, 'error');

            let imports = await buffer.listImports(mainFile);
            newSpyContext.restore();

            imports = await buffer.listImports(mainFile)
            expect(imports).not.to.be.empty;
        });
    });
});