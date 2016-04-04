# `gulp-less-changed`

> A [Gulp](http://gulpjs.com/) plugin to pass through LESS files only if they or their dependencies have changed

Analyses LESS files and their dependencies, i.e., imports and files included using `data-uri`, to save wasting time
regenerating output.

[![Build Status](https://travis-ci.org/bingnz/gulp-less-changed.svg?branch=master)](https://travis-ci.org/bingnz/gulp-less-changed)
[![Coverage Status](https://coveralls.io/repos/github/bingnz/gulp-less-changed/badge.svg?branch=master)](https://coveralls.io/github/bingnz/gulp-less-changed?branch=master)

[![Dependency Status](https://david-dm.org/bingnz/gulp-less-changed.svg)](https://david-dm.org/bingnz/gulp-less-changed)

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

As an optimisation, the import list for each file is kept in memory. If all of the imports for a particular file have the same timestamp,
the import list for that file is assumed to be the same. This helps to speed up incremental builds.

## API

### lessChanged()

Looks for .css files in the same directory as the input LESS files. If a LESS file has a later timestamp than its corresponding
CSS file, or if any of the LESS file's imports has a later timestamp than the CSS file, the LESS file is emitted to the stream.

### lessChanged(options)

 * **options.getOutputFileName** - `function` Map source paths to destination paths
   (e.g. `function(path) { return rename(path, { extname: 'min.css' }); }`)
   Overrides the default behaviour of looking for .css files in the input path.

## License

Copyright (c) 2016 David Chandler

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.