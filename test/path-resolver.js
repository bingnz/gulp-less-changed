'use strict';

var chai = require('chai');
var File = require('vinyl');
var FakeFs = require('fake-fs');
var path = require('path');
var pmock = require('pmock');
var through = require('through2');
var Promise = require('bluebird');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var proxyquire = require('proxyquire').noPreserveCache().noCallThru();

chai.use(sinonChai);
const expect = chai.expect;

function getPathResolver(options) {
    options = options || {};
    let fsStub = options.fs || new FakeFs();

    let proxies = {};
    proxies['fs'] = fsStub;

    let pathResolver = proxyquire('../release/path-resolver', proxies);
    return pathResolver;
}

describe('path-resolver', () => {
    let pathResolver;
    let fakeFs;
    let PathResolverError;
    let p;
    const currentDirectory = 'current/directory';
    beforeEach(() => {
        fakeFs = new FakeFs();
        p = pmock.cwd(currentDirectory);
        let resolverModule = getPathResolver({ fs: fakeFs });
        PathResolverError = resolverModule.PathResolverError;
        pathResolver = new (resolverModule.PathResolver);
    });

    afterEach(() => {
        p.reset();
    });

    describe('when paths are not specified', () => {
        it('should return path if file exists', () => {
            const filePath = 'this/file/exists.txt';
            fakeFs.file(filePath, { stat: { mtime: new Date() } });
            return pathResolver.resolve(filePath)
                .then(resolved => expect(resolved).to.equal(filePath));
        });

        it('should throw error if file doesn\'t exist', () => {
            const filePath = 'this/file/doesnot/exist.txt'.replace(new RegExp('/', 'g'), path.sep);
            return pathResolver.resolve(filePath)
                .then(resolved => expect.fail(1, 0, 'Should have thrown an error.'))
                .catch(PathResolverError, error => {
                    expect(error.message).to.contain(`Import file '${filePath}' wasn't found.`);
                    expect(error.message).to.contain(`Tried: '${filePath}'`);
                })
                .catch(error => expect.fail(1, 0, error));
        });

        it('should also try current directory', () => {
            const fileName = 'file.txt';
            const filePath = path.join('this/file', fileName);

            fakeFs.file(path.join(currentDirectory, fileName), { stat: { mtime: new Date() } });
            return pathResolver.resolve(filePath)
                .then(resolved => expect(resolved).to.equal(path.normalize(path.join(currentDirectory, fileName))));
        });
    });

    describe('when paths are specified', () => {
        it('should return path if file exists in one of the paths', () => {
            const fileName = 'exists.txt';
            const anotherPath = 'another/Path';
            const thisPath = 'this/path';
            const yetAnotherPath = 'yetAnotherPath';

            fakeFs.file(path.join(thisPath, fileName), { stat: { mtime: new Date() } });
            return pathResolver.resolve(fileName, [anotherPath, thisPath, yetAnotherPath])
                .then(resolved => expect(resolved).to.equal(path.join(thisPath, fileName)));
        });

        it('should throw error if file doesn\'t exist in any of the paths', () => {
            const fileName = 'missing.txt';
            const anotherPath = 'another/Path';
            const yetAnotherPath = 'yetAnotherPath';

            return pathResolver.resolve(fileName, [anotherPath, yetAnotherPath])
                .then(resolved => expect.fail(1, 0, 'Should have thrown an error.'))
                .catch(PathResolverError, error => {
                    expect(error.message).to.contain(`Import file '${fileName}' wasn't found.`);
                    expect(error.message).to.contain(`'${fileName}'`);
                    expect(error.message).to.contain(`'${path.join(anotherPath, fileName)}'`);
                    expect(error.message).to.contain(`'${path.join(yetAnotherPath, fileName)}'`);
                })
                .catch(error => expect.fail(1, 0, error));
        });

        it('should also try current directory', () => {
            const fileName = 'file.txt';
            const filePath = path.join('this/file', fileName);

            fakeFs.file(path.join(currentDirectory, fileName), { stat: { mtime: new Date() } });
            return pathResolver.resolve(filePath, ['bad1', 'bad2'])
                .then(resolved => expect(resolved).to.equal(path.join(currentDirectory, fileName)));
        });
    });
});