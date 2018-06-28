import gulp from "gulp";
import path from "path";
import merge from "merge2";
const plugins = require("gulp-load-plugins")();
import lazypipe from "lazypipe";
import del from "del";

var tsProject = plugins.typescript.createProject("tsconfig.json", {
    typescript: require("typescript")
});

function istanbulTypeScriptIgnores() {
    var ignoreReplacement = "/* istanbul ignore next */\n$1";
    return lazypipe()
        .pipe(
            plugins.replace,
            /(var __extends =)/,
            ignoreReplacement
        )
        .pipe(
            plugins.replace,
            /(var __awaiter =)/,
            ignoreReplacement
        )
        .pipe(
            plugins.replace,
            /(var __generator =)/,
            ignoreReplacement
        )
        .pipe(
            plugins.replace,
            /(var _this = _super\.call)/,
            ignoreReplacement
        )();
}

function clean() {
    return del(["release", "coverage", ".nyc_output"]);
}

gulp.task("clean", clean);

function compile() {
    var tsResult = gulp
        .src(["src/**/*.ts", "custom-typings/*.d.ts"])
        .pipe(plugins.sourcemaps.init())
        .pipe(tsProject());

    return merge([
        tsResult.dts.pipe(gulp.dest("release")),
        tsResult.js
            .pipe(istanbulTypeScriptIgnores())
            .pipe(
                plugins.sourcemaps.write("./", {
                    includeContent: false,
                    sourceRoot: function() {
                        return path.normalize(process.cwd() + "/src");
                    }
                })
            )
            .pipe(gulp.dest("release"))
    ]);
}

gulp.task("compile", compile);

function tslint() {
    return gulp
        .src("src/**/*.ts")
        .pipe(plugins.tslint())
        .pipe(plugins.tslint.report());
}

gulp.task("tslint", tslint);

function eslint() {
    return gulp
        .src(["./gulpfile.babel.js", "test/**/*.js"])
        .pipe(plugins.eslint())
        .pipe(plugins.eslint.format())
        .pipe(plugins.eslint.failAfterError());
}

gulp.task("eslint", eslint);

const build = gulp.series(
    "clean",
    gulp.parallel("compile", "tslint", "eslint")
);

export default build;
