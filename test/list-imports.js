'use strict';

var chai = require('chai');
//var es = require('event-stream');
var File = require('vinyl');
//var vinylFs = require('vinyl-fs');
//var FakeFs = require('fake-fs');
var rewire = require('rewire');
//var streamAssert = require('stream-assert');
//var sinon = require('sinon');

var listImports = rewire('../release/list-imports');

var expect = chai.expect;

describe('list-imports', () => {
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
            listImports(fakeFile)
                .then(importList => expect(importList).to.be.empty);
        });
    });

    describe('when passing in a file with an import', () => {
        let fakeFile = new File({ path: 'something.less', contents: new Buffer('import \'file2.less\';') });
        it('should return the single import', () => {
            return listImports(fakeFile)
                .then(importList => expect(importList).to.equal([ 'file2.less' ]));
        });
    });
});