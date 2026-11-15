import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/queries';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FarmerMascot, SuitUpMascot, useJustSignedIn } from './FarmerMascot';

/** A sentence made of coloured parts, like the hero headline (white + gold). */
type Part = { text: string; gold?: boolean };
type Sentence = Part[];

const TYPE_MS = 45;
const ERASE_MS = 18;
const HOLD_MS = 1900;
const GAP_MS = 350;

/**
 * Loops through `sentences`: types one letter at a time, holds, erases, then moves to the next one.
 * Returns which sentence is showing and how many letters of it are visible.
 */
function useLoopingTypewriter(sentences: string[], { startDelayMs, enabled }: { startDelayMs: number; enabled: boolean }) {
  const [pos, setPos] = useState({ index: 0, chars: 0 });
  const key = sentences.join('\u0000');
  useEffect(() => {
    if (!enabled) return;
    const list = key.split('\u0000');
    let index = 0;
    let chars = 0;
    let erasing = false;
    let timer = 0;
    const step = () => {
      const length = list[index].length;
      if (!erasing) {
        if (chars < length) {
          chars += 1;
          setPos({ index, chars });
          timer = window.setTimeout(step, TYPE_MS);
        } else {
          erasing = true;
          timer = window.setTimeout(step, HOLD_MS);
        }
      } else if (chars > 0) {
        chars -= 1;
        setPos({ index, chars });
        timer = window.setTimeout(step, ERASE_MS);
      } else {
        erasing = false;
        index = (index + 1) % list.length;
        timer = window.setTimeout(step, GAP_MS);
      }
    };
    setPos({ index: 0, chars: 0 });
    timer = window.setTimeout(step, startDelayMs);
    return () => window.clearTimeout(timer);
  }, [key, startDelayMs, enabled]);
  return pos;
}

/** Renders the first `chars` letters of a coloured sentence. */
function PartialSentence({ sentence, chars }: { sentence: Sentence; chars: number }) {
  let left = chars;
  return (
    <>
      {sentence.map((part, i) => {
        const shown = part.text.slice(0, Math.max(0, left));
        left -= part.text.length;
        return shown ? (
          <span key={i} className={part.gold ? 'text-gold-500' : 'text-cream-50'}>
            {shown}
          </span>
        ) : null;
      })}
    </>
  );
}

/**
 * Hero mascot. Below the hero text on small screens; on wide screens it sits in the
 * bottom-right corner of the hero. Logged in: the floating farmer-astronaut with a looping
 * typewriter greeting above him. Logged out: the farmer himself.
 */
export function HeroMascot({ authed }: { authed: boolean }) {
  const justSignedIn = useJustSignedIn(); // one-time flag set by the login page
  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 lg:items-end pb-10 lg:absolute lg:bottom-6 lg:right-4 lg:mx-0 lg:w-[34rem] lg:max-w-[40%] lg:px-0 lg:pb-0 xl:right-8">
      {authed ? <WelcomeGreeting justSignedIn={justSignedIn} /> : null}
      {/* About 40% of the screen height on wide screens */}
      <div className="aspect-[200/260] w-56 sm:w-64 lg:h-[40vh] lg:max-h-[380px] lg:min-h-[230px] lg:w-auto">
        {authed ? <SuitUpMascot play={!!justSignedIn} className="w-full" /> : <FarmerMascot className="w-full" />}
      </div>
    </div>
  );
}

function WelcomeGreeting({ justSignedIn }: { justSignedIn: 'login' | 'register' | null }) {
  const session = useSession();
  const { calmMotion } = usePreferences();
  const name = session.data?.user?.name?.trim().split(/\s+/)[0];
  const sentences: Sentence[] = [
    [{ text: justSignedIn === 'register' ? 'Welcome aboard, ' : 'Welcome back, ' }, { text: 'Captain Farmer!', gold: true }],
    ...(name ? [[{ text: 'Hi ' }, { text: `${name}.`, gold: true }]] : []),
    [{ text: 'Your mission control for the ' }, { text: 'next growing season', gold: true }, { text: ' is ready.' }],
  ];
  const plain = sentences.map((s) => s.map((p) => p.text).join(''));
  // Start typing once the ~1 s suit-up has finished.
  const pos = useLoopingTypewriter(plain, { startDelayMs: justSignedIn ? 1300 : 400, enabled: !calmMotion });

  const textClass = 'font-display text-2xl leading-snug sm:text-3xl [text-shadow:0_2px_14px_rgb(0_0_0/0.65)]';
  return (
    <div className="mb-3 w-full text-left" data-testid="welcome-banner">
      {/* Screen readers get the whole greeting once, not the looping letters. */}
      <p className="sr-only">{plain.join(' ')}</p>
      {calmMotion ? (
        <div className={textClass} aria-hidden>
          {sentences.map((s, i) => (
            <p key={i}>
              <PartialSentence sentence={s} chars={plain[i].length} />
            </p>
          ))}
        </div>
      ) : (
        // Fixed two-line height so the astronaut never jumps while the text types.
        <p className={`${textClass} flex min-h-[2.75em] items-end justify-start`} aria-hidden data-testid="welcome-typed">
          <span>
            <PartialSentence sentence={sentences[pos.index % sentences.length]} chars={pos.chars} />
            <span className="fv-caret text-gold-500" />
          </span>
        </p>
      )}
    </div>
  );
}
