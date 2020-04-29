# For tests needing files

- file-webp-masquerading-as-png.png : Image file is actually webp format, but extension is png. Can't be opened by some tools (e.g. Mac OS preview), but browsers and VS Code will properly recognize the type and be able to open it. The file may seem corrupt but it isn't.

- png-masquerading-as-jpg: Image file is a png, but extension is jpg. Can be opened by most tools without issues.

- 1pixel.png: Image file is a png, consisting of only 1 pixel. Used for small files tests.

- 1pixel.webp: Image file is a webp, consisting of only 1 pixel. Used for small files tests.

- 1pixel-masquerade.png: Image file is webp, consisting of only one pixel. Masquerades as png file.

- 1pixel.xcf: Image file is xcf format, currently unsupported for file type checking.

- file.svg: Image file is svg format, currently unsupported for file type checking (svg requires type and xml format validation).
