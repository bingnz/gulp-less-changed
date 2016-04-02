# `gulp-less-changed`

> A [Gulp](http://gulpjs.com/) plugin to pass through LESS files only if they or their dependencies have changed

Analyses LESS files and their dependencies, i.e., imports and files included using `data-uri`, to save wasting time
regenerating output.

## Install

```
$ npm install gulp-less-changed --save-dev
```

## Example

### Using `gulp-less-changed` where the CSS output is generated next to the LESS input

```js
const gulp = require('gulp');
const lessChanged = require('gulp-less-changed');
const less = require('gulp-less');

gulp.task('default', () => {
    return gulp.src('src/*.less')
        .pipe(lessChanged())
        .pipe(less())
        .pipe(gulp.dest('src'));
});
```

### Using `gulp-less-changed` where the CSS output has a different path and extension

```js
const gulp = require('gulp');
const lessChanged = require('gulp-less-changed');
const rename = require('rename');
const less = require('gulp-less');
const cleanCss = require('gulp-clean-css');
const gulpRename = require('gulp-rename');

const OutputPath = 'dest';
const MinifiedExtension = '.min.css';

gulp.task('default', () => {
    return gulp.src('src/*.less')
        .pipe(lessChanged({
            getOutputFileName: file => rename(file, { dirname: OutputPath, extname: MinifiedExtension })
        }))
        .pipe(less())
        .pipe(cleanCss())
        .pipe(gulpRename({ extname: MinifiedExtension }))
        .pipe(gulp.dest(OutputPath));
});
```
### Using `gulp-less-changed` for incremental builds

```js
const gulp = require('gulp');
const lessChanged = require('gulp-less-changed');
const rename = require('rename');
const less = require('gulp-less');
const cleanCss = require('gulp-clean-css');
const gulpRename = require('gulp-rename');

const OutputPath = 'dest';
const MinifiedExtension = '.min.css';

gulp.task('css', () => {
    return gulp.src('src/*.less')
        .pipe(lessChanged({
            getOutputFileName: file => rename(file, { dirname: OutputPath, extname: MinifiedExtension })
        }))
        .pipe(less())
        .pipe(cleanCss())
        .pipe(gulpRename({ extname: MinifiedExtension }))
        .pipe(gulp.dest(OutputPath));
});

gulp.task('default', () => {
    return gulp.watch('src/*.less', ['css']);
});
```

## API

### lessChanged()

Looks for .css files in the same directory as the input LESS files. If a LESS file has a later timestamp than its corresponding
CSS file, or if any of the LESS file's imports has a later timestamp than the CSS file, the LESS file is emitted to the stream.

### lessChanged(options)

 * **options.getOutputFileName** - `function` Map source paths to destination paths
   (e.g. `function(path) { return rename(path, { extname: 'min.css' }); }`)
   Overrides the default behaviour of looking for .css files in the input path.

## License

Copyright (c) 2016, David Chandler

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
