var gulp = require('gulp');
var path = require('path');
var merge = require('merge2');
var plugins = require('gulp-load-plugins')();

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

gulp.task('compile', function () {
    var tsResult = gulp.src(['src/**/*.ts', 'typings/main.d.ts'])
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

gulp.task('run-tests', ['compile'], function () {
    return gulp.src('test/**/*.js', { read: false })
        .pipe(plugins.mocha({ reporter: 'spec' }));
});

gulp.task('default', ['compile']);