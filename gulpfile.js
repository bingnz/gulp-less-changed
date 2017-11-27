var gulp = require('gulp');
var path = require('path');
var merge = require('merge2');
var plugins = require('gulp-load-plugins')();
var through2 = require('through2');
var os = require('os');
var lazypipe = require('lazypipe');
var remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

gulp.task('compile', function () {
    var tsResult = gulp.src(['src/**/*.ts', 'custom-typings/*.d.ts'])
        .pipe(plugins.sourcemaps.init())
        .pipe(tsProject());

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

function istanbulTypeScriptIgnores() {
    var ignoreReplacement = '/* istanbul ignore next */\n$1'
    return lazypipe()
        .pipe(plugins.replace, /(var __extends =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var __awaiter =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var __generator =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var _this = _super\.call)/, ignoreReplacement)();
}

gulp.task('pre-test', ['compile'], function () {
    return gulp.src(['release/**/*.js'])
        .pipe(istanbulTypeScriptIgnores())
        // Covering files
        .pipe(plugins.istanbul())
        // Force `require` to return covered files
        .pipe(plugins.istanbul.hookRequire());
});

gulp.task('test-and-coverage', ['pre-test'], function () {
    return gulp.src('test/**/*.js', { read: false })
        .pipe(plugins.mocha({ reporter: 'spec' }))
        .pipe(plugins.istanbul.writeReports());
});

gulp.task('run-tests', ['test-and-coverage'], function () {
    return gulp.src('coverage/coverage-final.json')
        .pipe(remapIstanbul({
            reports: {
                'json': 'coverage/remapped-coverage.json',
                'html': 'coverage/remapped-report',
                'lcovonly': 'coverage/remapped-lcov.info'
            }
        }))
        .pipe(gulp.dest('coverage'));
});

gulp.task('default', ['compile']);