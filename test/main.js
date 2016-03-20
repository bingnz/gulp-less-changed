'use strict';

var chai = require('chai');
var File = require('vinyl');
var vinylFs = require('vinyl-fs');
var FakeFs = require('fake-fs');
var rewire = require('rewire');
var streamAssert = require('stream-assert');
var sinon = require('sinon');

var lessChanged = rewire('../release/main');

var expect = chai.expect;

describe('gulp-less-changed', () => {

    beforeEach(() => {
        lessChanged.__set__('ListImports', {
            listImports: function() {
                return new Promise((resolve, reject) => resolve([]));
            }
        });
        lessChanged.__set__('fs', new FakeFs());
    });

    describe('when passing in an unresolved file', () => {
        let lessChangedStream = lessChanged();
        lessChangedStream.write(new File());
        lessChangedStream.end();

        it('should not pass any file onto the stream', (done) => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });

    describe('when passed a file with no imports that has not changed', () => {
        let date = new Date();
        let fs = new FakeFs();
        lessChanged.__set__('fs', fs);

        fs.file('something.css', { mtime: date });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: date }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should not pass any file onto the stream', (done) => {
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
        lessChanged.__set__('fs', fs);

        fs.file('something.css', { mtime: newerDate });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: olderDate }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should not pass any file onto the stream', (done) => {
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
        lessChanged.__set__('fs', fs);

        fs.file('hello.css', { mtime: olderDate });

        let fakeLessFile = new File({ path: 'hello.less', stat: { mtime: newerDate }, contents: new Buffer('some content') });

        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeLessFile);
        lessChangedStream.end();

        it('should pass the file onto the stream', (done) => {
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
        lessChanged.__set__('fs', fs);

        fs.file('hello.css', { mtime: date });

        var fakeError = new Error('ENOENT');
        fakeError.code = 'ENOENT';
        sinon.stub(fs, 'stat', file => {
            throw fakeError;
        });

        let fakeLessFile = new File({ path: 'hello.less', stat: { mtime: date }, contents: new Buffer('some content') });

        let lessChangedStream = lessChanged();
        lessChangedStream.write(fakeLessFile);
        lessChangedStream.end();
        it('should pass the file onto the stream', (done) => {
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
        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();
            lessChanged.__set__('fs', fs);

            fs.file('hello.css', { mtime: date });

            var fakeError = new Error('test');
            fakeError.code = 'SOMEERR';
            sinon.stub(fs, 'stat', file => {
                throw fakeError;
            });

            fakeLessFile = new File({ path: 'hello.less', stat: { mtime: date }, contents: new Buffer('some content') });

            lessChangedStream = lessChanged();
        });

        it('should emit an error to the stream', (done) => {
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

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();
            lessChanged.__set__('fs', fs);

            fs.file('import.less', { mtime: date, contents: new Buffer('some content') });
            lessChanged.__set__('ListImports', {
                listImports: function() {
                    return new Promise((resolve, reject) => resolve(['import.less']));
                }
            });

            fs.file('main.css', { mtime: date });

            fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', (done) => {
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

        beforeEach(() => {
            let olderDate = new Date();
            let newerDate = new Date();
            newerDate.setDate(newerDate.getDate() + 1);

            let fs = new FakeFs();
            lessChanged.__set__('fs', fs);

            fs.file('import.less', { mtime: newerDate, contents: new Buffer('some content') });
            lessChanged.__set__('ListImports', {
                listImports: function() {
                    return new Promise((resolve, reject) => resolve(['import.less']));
                }
            });

            fs.file('main.css', { mtime: olderDate });

            fakeFile = new File({ path: 'main.less', stat: { mtime: olderDate }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should pass the file onto the stream', (done) => {
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

        beforeEach(() => {
            let olderDate = new Date();
            let middleDate = new Date();
            let newerDate = new Date();
            middleDate.setDate(middleDate.getDate() + 1);
            newerDate.setDate(newerDate.getDate() + 2);

            let fs = new FakeFs();
            lessChanged.__set__('fs', fs);

            fs.file('import.less', { mtime: middleDate, contents: new Buffer('some content') });
            lessChanged.__set__('ListImports', {
                listImports: function() {
                    return new Promise((resolve, reject) => resolve(['import.less']));
                }
            });

            fs.file('main.css', { mtime: newerDate });

            fakeFile = new File({ path: 'main.less', stat: { mtime: olderDate }, contents: new Buffer('@import \'import.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', (done) => {
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

        beforeEach(() => {
            let date = new Date();

            let fs = new FakeFs();
            lessChanged.__set__('fs', fs);

            lessChanged.__set__('ListImports', {
                listImports: function() {
                    return new Promise((resolve, reject) => resolve(['missing.less']));
                }
            });

            fs.file('main.css', { mtime: date });

            fakeFile = new File({ path: 'main.less', stat: { mtime: date }, contents: new Buffer('@import \'missing.less\';') });
            lessChangedStream = lessChanged();
        });

        it('should not pass the file onto the stream', (done) => {
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
        lessChanged.__set__('fs', fs);

        fs.file('something.different.ext', { mtime: newerDate });

        let fakeFile = new File({ path: 'something.less', stat: { mtime: olderDate }, contents: new Buffer('some content') });
        let lessChangedStream = lessChanged({ getOutputFileName: input => input.replace('.less', '.different.ext') });
        lessChangedStream.write(fakeFile);
        lessChangedStream.end();

        it('should look for the correct output file', (done) => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done))
                .once('assertion', done);
        });
    });
});