---
title: 3. Artikel
author: sma
tags: [blog, gatsby, react]
date: 2023-10-01
---

# Dritter Artikel über Github

I want to support indentation in a multiline `TextField`.

What's the best way to do so? Here's my current approach.

To indent on TAB, I use an explicit `TextEditingController` and wrap the `TextField` in a `CallbackShortcuts` widget to detect the TAB key. I know I could use intents and actions here, but it's simpler this way. I can access then controller from the callbacks.

```dart
class _Editor extends State<Editor> {
  final _controller = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.tab): _indent,
        const SingleActivator(LogicalKeyboardKey.tab, shift: true): _dedent,
      },
      child: TextField(
        controller: _controller,
        ...
      ),
    );
  }

  void _indent() {
    ...
  }

  void _dedent() {
    ...
  }
}
```

That `_ident` method retrieves the current `TextEditingValue` from the controller and manipulates it like this: I'm looking for the start of the current line as determined by the value's cursor position (or start of a selection). Then I count the spaces at the beginning of that line and add enough spaces to reach the next tab stop, as determined by my global `indentation` value.

```dart
  void _indent() {
    final value = _controller.value;
    if (value.isComposingRangeValid) return;
    final start = value.selection.start;

    // find begin of this line
    var begin = start;
    while (begin > 0 && value.text.codeUnitAt(begin - 1) != 10) {
      begin--;
    }

    // determine indentation
    var indent = begin;
    while (indent < value.text.length && value.text.codeUnitAt(indent) == 32) {
      indent++;
    }
    indent -= begin;

    final spaces = ' ' * (indentation - indent % indentation);
    _controller.value = value.copyWith(
      text: value.text.replaceRange(begin, begin, spaces),
      selection: TextSelection.collapsed(offset: start + spaces.length),
    );
  }
```

I must not interrupt the compositing state.

Unfortunately, I cannot abort the action and let the framework do its default thing. I'm also unsure whether this approach works with bidi or RTL text, but living in an LTR culture, I consider it "good enough."

I'm using `codeUnitAt` everywhere because I hope this way I reduce the number of temporary strings. Perhaps a premature optimization.

Note that I always indent the line which typically happens only if the cursor within the indenting spaces. Otherwise an editor often inserts a TAB character or adds spaces at the current cursor position.

I could refactor the computation into an `TextEditingValue` extension, I guess. 

```dart
extension on TextEditingValue {
  (int, int) beginAndIndentation(int cursor) {
    var begin = cursor;
    while (begin > 0 && text.codeUnitAt(begin - 1) != 10) {
      begin--;
    }
    var indent = begin;
    while (indent < text.length && text.codeUnitAt(indent) == 32) {
      indent++;
    }
    return (begin, indent - begin);
  }

  TextEditingValue replaceText(int start, int? end, String replacement, {int? cursor}) {
    return copyWith(
      text: text.replaceRange(start, end, replacement),
      selection: cursor != null ? TextSelection.collapsed(offset: cursor) : null,
    );
  }
}
```

Here's the refactored version of `_indent`:

```dart
  void _indent() {
    final value = _controller.value;
    if (value.isComposingRangeValid) return;
    final start = value.selection.start;
    final (begin, indent) = value.beginAndIndentation(start);
    final spaces = indentation - indent % indentation;
    _controller.value = value.replaceText(begin, begin, ' ' * spaces, cursor: start + spaces);
  }
```

Shift-TAB should dedent. The code is very similar and I can again make use of my extension:

```dart
  void _dedent() {
    final value = _controller.value;
    if (value.isComposingRangeValid) return;
    final start = value.selection.start;
    final (begin, indent) = value.beginAndIndentation(start);
    if (indent == 0) return;
    final delete = indent % indentation == 0 ? indentation : indent % indentation;
    _controller.value = value.replaceText(begin, begin + delete, '', cursor: max(start - delete, begin));
  }
```

This works for a single line, but often, you can indent or dedent multiple lines with they are all selected. Feel free to add this.

I'd like to discuss a different topic.

I want to keep the indentation on ENTER.

I could add another `SingleActivator` shortcut, but I feel this is the wrong approach. Because the shortcuts eat up the events, I'd have to implement the default behavior, too. Using a `FocusNode` to catch key events also feels wrong, because that doesn't always work with soft keyboards. Also, it messes with composing.

So I came up with the idea to create my own `TextInputFormatter`:

```dart
      child: TextField(
        controller: _controller,
        inputFormatters: const [EditorTextInputFormatter(indentation)],
        ...
      )
```

That class must implement a `formatEditUpdate` method that get both the old and the new `TextEditingValue` and should allow or reject the new one – or return a completely different one. However, I need to detect whether ENTER was pressed. And while I'm on it, I also try to detect BACKSPACE.

```dart
class EditorTextInputFormatter extends TextInputFormatter {
  const EditorTextInputFormatter([this.indentation = 4]);
  final int indentation;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    if (newValue.isComposingRangeValid) return newValue;
    if (!newValue.selection.isCollapsed) return newValue;

    final oldSelection = oldValue.selection.textInside(oldValue.text);
    final oldLength = oldValue.text.length - oldSelection.length;
    final newLength = newValue.text.length;
    final start = newValue.selection.start;

    if (oldLength + 1 == newLength && start > 0) {
      return insert(newValue, start, oldSelection);
    } else if (oldLength - 1 == newLength && start == oldValue.selection.start - 1) {
      return delete(newValue, start, oldSelection);
    }
    return newValue;
  }

  ...
}
```

I will not mess with the value if composing is happening or if the new value has a selection (for whatever reason). Otherwise, I try to determine whether exactly one character was added and the cursor is behind that character. In that case, I call `insert`. I pass along the old selection because I eventually want to support pressing `"` on a selected region and surround it by quotes instead of replacing the selection with a single quote. If exactly one character was removed and the cursor was moved one step to the left (to distinguish BACKSPACE from DELETE), I call `delete`.

Here is `insert`:

```dart
  TextEditingValue insert(TextEditingValue newValue, int start, String oldSelection) {
    // this is the single character that was inserted
    final ch = newValue.text.codeUnitAt(start - 1);
    if (ch == 10) return _autoIndent(newValue, start);
    ...
    return newValue;
  }
```

To keep the indentation on RETURN, I call `_autoIndent`. It will go to the previous line – if there is one – and determine the indentation. Then it will replicate that indentation at the current cursor position which is right after the `\n`.

This would be also the place where you could continue to apply a prefix like `/// `. Or add extra intent because the previous line starts with ` * ` or ends with `{` or whatever your language of choice requires.

```dart
  TextEditingValue _autoIndent(TextEditingValue newValue, int start) {
    if (start < 2) return newValue;
    final (_, indent) = newValue.beginAndIndentation(start - 2);
    if (indent == 0) return newValue;
    return newValue.replaceText(start, start, ' ' * indent, cursor: start + indent);
  }
```

To dedent on BACKSPACE, I need to detect whether the deletion was at the beginning of the line or within the line. In the later case, I do not want to dedent.

```dart
  TextEditingValue delete(TextEditingValue newValue, int start, String oldSelection) {
    final (begin, indent) = newValue.beginAndIndentation(start);
    final delete = indent % indentation;
    if (delete == 0 || start > begin + indent) return newValue;
    return newValue.replaceText(begin, begin + delete, '', cursor: start - delete);
  }
```

Digression: I really dislike that selected empty lines are invisible. Visual Studio Code extends its selection to the otherwise invisble newline character. It also replaces spaces with middle dots. Can I do the same?

I tried to replace the `TextEditingController` with my own subclass so I could overwrite the `buildTextSpan` method, but adding a "newline" character didn't work at all:

```dart
class EditorTextEditingController extends TextEditingController {
  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final t = text.replaceAll('\n', '↲\n').replaceAll(' ', '·');
    return TextSpan(text: t, style: style);
  }
}
```

It looks like the internal implementation of `TextField` doesn't just use the `TextSpan` for display, but also for placing the cursor and messing the with the length of the text breaks everything.

At least the middle dots kind of work.

Here's a version that adds the dots only to the selection, but it ignores composing which should be highlighted as an underlined style:

```dart
class EditorTextEditingController extends TextEditingController {
  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final t = '${selection.textBefore(text)}'
        '${selection.textInside(text).replaceAll(' ', '·')}'
        '${selection.textAfter(text)}';
    final dimStyle = style?.copyWith(color: style.color?.withOpacity(0.2));
    return TextSpan(
      children: [
        for (final match in RegExp('(·+)|[^·]+').allMatches(t))
          TextSpan(
            text: match[0],
            style: match[1] != null ? dimStyle : null,
          ),
      ],
      style: style,
    );
  }
}
```

I need to either overimpose the composing style on an existing list of `TextSpan` objects or make creation of my text spans even more difficult as any of them could contain either the start or the end or both of the composing text range. I need to consider these cases: 
 - a span doesn't intersect with the composing range at all
 - a span contains both the start and the end of the range
 - a span contains the start of the range
 - a span contains the end of the range

Here is a hopefully correct implementation:

```dart
class EditorTextEditingController extends TextEditingController {
  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    Iterable<TextSpan> spans;
    if (selection.isCollapsed) {
      spans = [TextSpan(text: text, style: style)];
    } else {
      final dimStyle = style?.copyWith(color: style.color?.withOpacity(0.2));
      final t = '${selection.textBefore(text)}'
          '${selection.textInside(text).replaceAll(' ', '·')}'
          '${selection.textAfter(text)}';
      spans = RegExp('(·+)|[^·]+').allMatches(t).map((match) => TextSpan(
            text: match[0],
            style: match[1] != null ? dimStyle : null,
          ));
    }

    final composingRegionOutOfRange = !value.isComposingRangeValid || !withComposing;
    if (composingRegionOutOfRange) {
      return TextSpan(children: [...spans], style: style);
    }

    final composingStyle = style?.merge(const TextStyle(decoration: TextDecoration.underline)) ??
        const TextStyle(decoration: TextDecoration.underline);
    return TextSpan(children: [..._addStyle(spans, value.composing, composingStyle)], style: style);
  }

  /// Adds [style] to the given [range] of [spans], assuming they form a flat
  /// list of continous styles. If the range is invalid or collapsed, the
  /// spans are returned unchanged.
  static Iterable<TextSpan> _addStyle(Iterable<TextSpan> spans, TextRange range, TextStyle style) sync* {
    if (!range.isValid || range.isCollapsed) {
      yield* spans;
    } else {
      var start = 0;
      for (final span in spans) {
        final text = span.text!;
        final end = start + text.length;
        if (start >= range.end || end <= range.start) {
          yield span;
        } else {
          final starting = range.start - start;
          final ending = min(end, range.end) - start;
          if (starting > 0) {
            yield TextSpan(text: text.substring(0, starting));
          }
          yield TextSpan(
            text: text.substring(starting, ending),
            style: style.merge(style),
          );
          if (ending < text.length) {
            yield TextSpan(text: text.substring(ending));
          }
        }
        start = end;
      }
    }
  }
}
```
