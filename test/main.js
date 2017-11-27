'use strict';
import chai from 'chai';
import File from 'vinyl';
import FakeFs from 'fake-fs';
import streamAssert from 'stream-assert';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
const proxyquire = require('proxyquire').noPreserveCache().noCallThru();

const expect = chai.expect;
chai.use(sinonChai);

function getLessChanged(options) {
    options = options || {};
    const fsStub = options.fs || new FakeFs();
    const listImportsStub = options.listImports || {
        ImportLister: function () {
            return {
                listImports: function () {
                    return Promise.resolve([]);
                }
            }
        }
    };
    const importBufferStub = options.importBuffer || {
        ImportBuffer: function (lister, key) {
            return {
                listImports: function (file) {
                    return lister(file);
                }
            }
        }
    };

    const lessChanged = proxyquire('../release/main', { './import-lister': listImportsStub, './import-buffer': importBufferStub, 'fs': fsStub });
    return lessChanged;
}

describe('gulp-less-changed', () => {

    describe('when passing in an unresolved file', () => {
        let lessChanged = getLessChanged();
        let lessChangedStream = lessChanged();
        lessChangedStream.write(new File());
        lessChangedStream.end();

        it('should not pass any file onto the stream', done => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with no imports that has not changed', () => {
        let date = new Date();
        let fs = new FakeFs();
        let lessChanged = getLessChanged({ fs: fs });

        fs.file('something.css', { mtime: date });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: date }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should not pass any file onto the stream', done => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with no imports where the output is newer', () => {
        let olderDate = new Date();
        let newerDate = new Date();
        newerDate.setDate(newerDate.getDate() + 1);

        let fs = new FakeFs();
        let lessChanged = getLessChanged({ fs: fs });

        fs.file('something.css', { mtime: newerDate });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: olderDate }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should not pass any file onto the stream', done => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with no imports that is newer than the output', () => {

        let olderDate = new Date();
        let newerDate = new Date();
        newerDate.setDate(newerDate.getDate() + 1);

        let fs = new FakeFs();
        let lessChanged = getLessChanged({ fs: fs });

        fs.file('hello.css', { mtime: olderDate });

        let fakeLessFile = new File({ path: 'hello.less', stat: { mtime: newerDate }, contents: new Buffer('some content') });

        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeLessFile);
        lessChangedStream.end();

        it('should pass the file onto the stream', done => {
            lessChangedStream
                .pipe(streamAssert.length(1))
                .pipe(streamAssert.first(item => expect(item).to.equal(fakeLessFile)))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when the output file doesn\'t exist', () => {

        let date = new Date();

        let fs = new FakeFs();
        let lessChanged = getLessChanged({ fs: fs });

        fs.file('hello.css', { mtime: date });

        var fakeError = new Error('ENOENT');
        fakeError.code = 'ENOENT';
        sinon.stub(fs, 'stat').callsFake(file => {
            throw fakeError;
        });

        let fakeLessFile = new File({ path: 'hello.less', stat: { mtime: date }, contents: new Buffer('some content') });

        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeLessFile);
        lessChangedStream.end();
        it('should pass the file onto the stream', done => {
            lessChangedStream
                .pipe(streamAssert.length(1))
                .pipe(streamAssert.first(item => expect(item).to.equal(fakeLessFile)))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when there is an error calling fs.stat for the output file', () => {
        let fakeLessFile;
        let lessChangedStream;
        let lessChanged;

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();
            lessChanged = getLessChanged({ fs: fs });

            fs.file('hello.css', { mtime: date });

            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            sinon.stub(fs, 'stat').callsFake(file => {
                throw fakeError;
            });

            fakeLessFile = new File({ path: 'hello.less', stat: { mtime: date }, contents: new Buffer('some content') });

            lessChangedStream = lessChanged();
        });

        it('should emit an error to the stream', done => {
            let errorOccurred = false;

            lessChangedStream.once('error', error => {
                expect(error.message).to.contain('Error processing \'hello.less\'');
                errorOccurred = true;
            });

            lessChangedStream.write(fakeLessFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    expect(errorOccurred).to.be.true;
                    done();
                }))
                .once('assertion', done);
        });
    });

    describe('when passed a file with an import that has not changed', () => {
        let lessChangedStream;
        let fakeFile;
        let lessChanged;

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();

            let importLister = {
                ImportLister: function () {
                    return {
                        listImports: function () {
                            return new Promise((resolve, reject) => resolve([{ path: 'import.less', time: date.getTime() }]));
                        }
                    }
                }
            };

            lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            fs.file('main.css', { mtime: date });

            fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', done => {
            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with an import that has changed', () => {
        let lessChangedStream;
        let fakeFile;
        let lessChanged;

        beforeEach(() => {
            let olderDate = new Date();
            let newerDate = new Date();
            newerDate.setDate(newerDate.getDate() + 1);

            let fs = new FakeFs();

            let importLister = {
                ImportLister: function () {
                    return {
                        listImports: function () {
                            return new Promise((resolve, reject) => resolve([{ path: 'import.less', time: newerDate.getTime() }]));
                        }
                    }
                }
            };

            fs.file('main.css', { mtime: olderDate });

            lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            fakeFile = new File({ path: 'main.less', stat: { mtime: olderDate }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should pass the file onto the stream', done => {
            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.length(1))
                .pipe(streamAssert.first(item => expect(item).to.equal(fakeFile)))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with an import that is newer than the main file but older than the output', () => {
        let lessChangedStream;
        let fakeFile;
        let lessChanged;

        beforeEach(() => {
            let olderDate = new Date();
            let middleDate = new Date();
            let newerDate = new Date();
            middleDate.setDate(middleDate.getDate() + 1);
            newerDate.setDate(newerDate.getDate() + 2);

            let fs = new FakeFs();

            let importLister = {
                ImportLister: function () {
                    return {
                        listImports: function () {
                            return new Promise((resolve, reject) => resolve([{ path: 'import.less', time: middleDate.getTime() }]));
                        }
                    }
                }
            };

            lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            fs.file('main.css', { mtime: newerDate });

            fakeFile = new File({ path: 'main.less', stat: { mtime: olderDate }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', done => {
            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with an import that doesn\'t exist', () => {
        let lessChangedStream;
        let fakeFile;
        let lessChanged;

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();

            lessChanged = getLessChanged({ fs: fs });

            fs.file('main.css', { mtime: date });

            fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'missing.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', done => {
            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when the output file name function is overridden', () => {
        let olderDate = new Date();
        let newerDate = new Date();
        newerDate.setDate(newerDate.getDate() + 1);

        let fs = new FakeFs();
        let lessChanged = getLessChanged({ fs: fs });

        fs.file('something.different.ext', { mtime: newerDate });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: olderDate }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged({ getOutputFileName: input => input.replace('.less', '.different.ext') });
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should look for the correct output file', done => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when no options are provided', () => {
        it('should pass the input file to the import lister', done => {
            let fs = new FakeFs();
            let date = new Date();

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(listImports, 'listImports');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let lessChangedStream = lessChanged();

            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    expect(listImports.listImports).to.have.been.calledWith(fakeFile);
                    done();
                }));
        });
    });

    describe('when the \'paths\' option is provided', () => {
        it('should pass the import file to the import lister list function', done => {
            let fs = new FakeFs();
            let date = new Date();
            const path1 = 'path1';
            const path2 = 'path/2/';

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(listImports, 'listImports');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let lessChangedStream = lessChanged({ paths: [path1, path2] });

            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    expect(listImports.listImports).to.have.been.calledWith(fakeFile)
                    done();
                }));
        });

        it('should pass the paths to the import lister', done => {
            let fs = new FakeFs();
            let date = new Date();
            const path1 = 'path1';
            const path2 = 'path/2/';

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(importLister, 'ImportLister');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let lessChangedStream = lessChanged({ paths: [path1, path2] });

            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    expect(importLister.ImportLister).to.have.been.calledWith({ paths: [path1, path2] })
                    done();
                }));
        });

        it('should reuse import lister for same paths', done => {
            let fs = new FakeFs();
            let date = new Date();
            const path1 = 'path1';
            const path2 = 'path/2/';

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(listImports, 'listImports');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile1 = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let fakeFile2 = new File({ path: 'main2.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });

            let lessChangedStream = lessChanged({ paths: [path1, path2] });

            lessChangedStream.write(fakeFile1);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    let lessChangedStream2 = lessChanged({ paths: [path1, path2] });

                    lessChangedStream2.write(fakeFile2);
                    lessChangedStream2.end();

                    lessChangedStream2
                        .pipe(streamAssert.end(() => {
                            expect(listImports.listImports).to.have.been.calledOnce;
                            done();
                        }));
                }));
        });

        it('should create new import lister for different paths', done => {
            let fs = new FakeFs();
            let date = new Date();
            const path1 = 'path1';
            const path2 = 'path/2/';

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(importLister, 'ImportLister');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile1 = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let fakeFile2 = new File({ path: 'main2.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });

            let lessChangedStream = lessChanged({ paths: [path1, path2] });

            lessChangedStream.write(fakeFile1);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    let lessChangedStream2 = lessChanged();

                    lessChangedStream2.write(fakeFile2);
                    lessChangedStream2.end();

                    lessChangedStream2
                        .pipe(streamAssert.end(() => {
                            expect(importLister.ImportLister).to.have.been.calledWith({ paths: [path1, path2] });
                            expect(importLister.ImportLister).to.have.been.calledWith({});
                            expect(importLister.ImportLister).to.have.been.calledTwice;
                            done();
                        }));
                }));
        });

        it('should create new import lister for different options', done => {
            let fs = new FakeFs();
            let date = new Date();
            const path1 = 'path1';
            const path2 = 'path/2/';

            let listImports = {
                listImports: function () {
                    return Promise.resolve([]);
                }
            };
            let importLister = {
                ImportLister: function () {
                    return listImports;
                }
            };

            sinon.spy(importLister, 'ImportLister');

            fs.file('main.css', { mtime: date });

            let lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            let fakeFile1 = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            let fakeFile2 = new File({ path: 'main2.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });

            let lessChangedStream = lessChanged({ paths: [path1, path2], something: 'first' });

            lessChangedStream.write(fakeFile1);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.end(() => {
                    let lessChangedStream2 = lessChanged({ paths: [path1, path2], something: 'second' });

                    lessChangedStream2.write(fakeFile2);
                    lessChangedStream2.end();

                    lessChangedStream2
                        .pipe(streamAssert.end(() => {
                            expect(importLister.ImportLister).to.have.been.calledWith({ paths: [path1, path2], something: 'first' });
                            expect(importLister.ImportLister).to.have.been.calledWith({ paths: [path1, path2], something: 'second' });
                            expect(importLister.ImportLister).to.have.been.calledTwice;
                            done();
                        }));
                }));
        });
    });

    describe('when there is an error processing an import', () => {
        let lessChangedStream;
        let fakeFile;
        let lessChanged;

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();

            let importLister = {
                ImportLister: function () {
                    return {
                        listImports: function () {
                            return Promise.reject(new Error('Some error.'));
                        }
                    };
                }
            };

            lessChanged = getLessChanged({ fs: fs, listImports: importLister });

            fs.file('main.css', { mtime: date });

            fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should pass the file onto the stream', done => {
            lessChangedStream.write(fakeFile);
            lessChangedStream.end();

            lessChangedStream
                .pipe(streamAssert.length(1))
                .pipe(streamAssert.first(item => expect(item).to.equal(fakeFile)))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });
});