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
    describe('when passing in an unresolved file', () => {
        let lessChangedStream = lessChanged();
        lessChangedStream.write(new File());
        lessChangedStream.end();

        it('should not pass any file onto the stream', (done) => {
            lessChangedStream
                .pipe(streamAssert.length(0))
                .pipe(streamAssert.end(done));
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
                .pipe(streamAssert.end(done));
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
                .pipe(streamAssert.end(done));
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
                .pipe(streamAssert.end(done));
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
                .pipe(streamAssert.end(done));
        });
    });

    describe('when there is an error calling fs.stat for the output file', () => {

        let date = new Date();

        let fs = new FakeFs();
        lessChanged.__set__('fs', fs);

        fs.file('hello.css', { mtime: date });

        var fakeError = new Error('test');
        fakeError.code = 'SOMEERR';
        sinon.stub(fs, 'stat', file => {
            throw fakeError;
        });

        let fakeLessFile = new File({ path: 'hello.less', stat: { mtime: date }, contents: new Buffer('some content') });

        let lessChangedStream = lessChanged();

        it('should emit an error to the stream', (done) => {
            lessChangedStream.once('error', error => {
                expect(error.message).to.contain('Error processing \'hello.less\'');
                done();
            });

            lessChangedStream.write(fakeLessFile);
            lessChangedStream.end();
        });
    });
});