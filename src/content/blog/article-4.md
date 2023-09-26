---
title: Neuer Test
author: Stefan
tags: [blog, gatsby, react]
date: 2024-10-01
---

I wrote

    /// Parses [input] as an .ini configuration.
    Map<String, Map<String, String>> 

and **Copilot** completed this:

    /// Parses [input] as an .ini configuration.
    Map<String, Map<String, String>> parse(String input) {
      final result = <String, Map<String, String>>{};
      var section = '';
      for (final line in input.split('\n')) {
        if (line.startsWith('[')) {
          section = line.substring(1, line.indexOf(']'));
          result[section] = {};
        } else if (line.contains('=')) {
          final parts = line.split('=');
          result[section][parts[0].trim()] = parts[1].trim();
        }
      }
      return result;
    }

That's not bad, but it's not great, either. It should probably trim the lines and ignore empty lines and line comments starting with `;`. When trying it a couple of minutes before, that worked. That `indexOf(']')` could return -1 and will then break the parser. Also, splitting at `=` is wrong, because we must split only at the **first** occurence, something the Dart `split` method can't do. Furthermore, we don't detect a missing section header or garbage input.

I added a `.map((line) => line.trim())` to the `for` and when I moved the cursor in a new line following the `for` statement, Copilot added:

        if (line.isEmpty || line.startsWith(';')) continue;

In the following `if` statement, I added `&&` and waited for the correct completion:

        if (line.startsWith('[') && line.endsWith(']')) {

To fix the remaining problems, I had to just move the cursor to the beginning of each line and Copilot was clever enough to do the correct thing which is kind of amazing.

Here's the final result:

    /// Parses [input] as an .ini configuration.
    Map<String, Map<String, String>> parse(String input) {
      final result = <String, Map<String, String>>{};
      var section = '';
      for (final line in input.split('\n').map((line) => line.trim())) {
        if (line.isEmpty || line.startsWith(';')) continue;
        if (line.startsWith('[') && line.endsWith(']')) {
          result[section = section = line.substring(1, line.length - 1)] = {};
        } else if (line.contains('=')) {
          final i = line.indexOf('=');
          final key = line.substring(0, i).trim();
          final value = line.substring(i + 1).trim();
          if (section.isEmpty) {
            throw FormatException('Invalid line: $line');
          }
          result[section]![key] = value;
        } else {
          throw FormatException('Invalid line: $line');
        }
      }
      return result;
    }

Does it work? Let's add tests.

I write

    test('empty',

and get my first unit test:

    test('empty', () {
      expect(parse(''), {});
    });

By prompting `test('comment'` I get this:

    test('comment', () {
      expect(parse('; comment\n'), {});
    });

By prompting `test('single section'` I get this:

    test('single section', () {
      expect(parse('[section]\n'), {'section': {}});
    });

It then provided these tests on its own:

    test('multiple sections', () {
      expect(parse('[section1]\n[section2]\n'), {'section1': {}, 'section2': {}});
    });
    test('single key-value', () {
      expect(parse('[section]\nkey=value\n'), {
        'section': {'key': 'value'}
      });
    });
    test('multiple key-values', () {
      expect(parse('[section]\nkey1=value1\nkey2=value2\n'), {
        'section': {'key1': 'value1', 'key2': 'value2'}
      });
    });

Then, I prompted `'invalid section'` and `'invalid key-value'` and got the correct code.

    test('invalid section', () {
      expect(() => parse('[section\n'), throwsFormatException);
    });
    test('invalid key-value', () {
      expect(() => parse('[section]\nkey\n'), throwsFormatException);
    });

The only prompt, that Copilot didn't know how to answer, was `'missing section'`. I had to write this final test on my own:

    test('missing section', () {
      expect(() => parse('key=value\n'), throwsFormatException);
    });

I got an implemention and 9 unit tests in less than 5 minutes and probably faster than searching for a package and reviewing it. This is of course a very simple example but Copilot was big time safer in this case.

I also asked for ChatGPT for unit tests and it wrote 7 tests that also completely covered the function (it didn't test for comments and provided that as 8th test upon request) in less than a minute.
