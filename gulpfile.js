var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

gulp.task('compile', function () {
    var tsResult = tsProject.src()
        .pipe(plugins.typescript(tsProject));

    return tsResult.js
        .pipe(plugins.flatten())
        .pipe(gulp.dest('release'));
})

gulp.task('default', ['compile']);