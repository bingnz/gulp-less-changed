var gulp = require('gulp');
var path = require('path');
var merge = require('merge2');
var plugins = require('gulp-load-plugins')();
var through2 = require('through2');
var os = require('os');

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

gulp.task('compile', function () {
    var tsResult = gulp.src(['src/**/*.ts', 'src/*.d.ts', 'typings/index.d.ts'])
        .pipe(plugins.sourcemaps.init())
        .pipe(plugins.typescript(tsProject));

    return merge([
        tsResult.dts
            .pipe(gulp.dest('release')),
        tsResult.js
            .pipe(plugins.sourcemaps.write('./', {
                includeContent: false,
                sourceRoot: function (file) {
                    return path.normalize(process.cwd() + '/src');
                }
            }))
            .pipe(gulp.dest('release'))
    ]);
});

// http://stackoverflow.com/questions/22155106/typescript-code-coverage-of-multiple-extends-declarations/26321994#26321994
function istanbulIgnoreTypeScriptExtend() {
    var tsExtends = /var __extends =/;
    return through2.obj(function(file, enc, done) {
        if (file.isBuffer() && tsExtends.test(file.contents)) {
            var rows = file.contents.toString().split('\n');
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].indexOf('var __extends =') === 0) {
                    rows.splice(i, 0, '/* istanbul ignore next: TypeScript extend */');
                    break;
                }
            }
            file.contents = new Buffer(rows.join(os.EOL));
        }
        this.push(file);
        done();
    });
}

gulp.task('pre-test', ['compile'], function () {
  return gulp.src(['release/**/*.js'])
    .pipe(istanbulIgnoreTypeScriptExtend())
    // Covering files
    .pipe(plugins.istanbul())
    // Force `require` to return covered files
    .pipe(plugins.istanbul.hookRequire());
});

gulp.task('run-tests', ['pre-test'], function () {
    return gulp.src('test/**/*.js', { read: false })
        .pipe(plugins.mocha({ reporter: 'spec' }))
        .pipe(plugins.istanbul.writeReports());
});

gulp.task('default', ['compile']);