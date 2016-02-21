var gulp = require('gulp');
var path = require('path');
var merge = require('merge2');
var plugins = require('gulp-load-plugins')();

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

gulp.task('compile', function () {
    var tsResult = gulp.src(['src/**/*.ts', 'src/less.d.ts', 'src/stream-to-array.d.ts', 'typings/main.d.ts'])
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

gulp.task('pre-test', ['compile'], function () {
  return gulp.src(['release/**/*.js'])
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