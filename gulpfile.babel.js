import gulp from 'gulp';
import path from 'path';
import merge from 'merge2';
const plugins = require('gulp-load-plugins')();
import lazypipe from 'lazypipe';
import del from 'del';

var tsProject = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript')
});

function istanbulTypeScriptIgnores() {
    var ignoreReplacement = '/* istanbul ignore next */\n$1'
    return lazypipe()
        .pipe(plugins.replace, /(var __extends =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var __awaiter =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var __generator =)/, ignoreReplacement)
        .pipe(plugins.replace, /(var _this = _super\.call)/, ignoreReplacement)();
}

function clean() {
    return del(['release', 'coverage', '.nyc_output']);
}

gulp.task('clean', clean);

function compile() {
    var tsResult = gulp.src(['src/**/*.ts', 'custom-typings/*.d.ts'])
        .pipe(plugins.sourcemaps.init())
        .pipe(tsProject());

    return merge([
        tsResult.dts
            .pipe(gulp.dest('release')),
        tsResult.js
            .pipe(istanbulTypeScriptIgnores())
            .pipe(plugins.sourcemaps.write('./', {
                includeContent: false,
                sourceRoot: function (file) {
                    return path.normalize(process.cwd() + '/src');
                }
            }))
            .pipe(gulp.dest('release'))
    ]);
}

gulp.task('compile', compile);

const build = gulp.series('clean', 'compile');

export default build;