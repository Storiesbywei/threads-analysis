/**
 * sub-classifiers.mjs — Second-pass sub-classification for 9 parent tags
 *
 * Refines monolithic tags into finer-grained sub-categories using keyword matching.
 * Multi-label: a post can match multiple sub-tags.
 * Colon-namespaced format (parent:child) for easy parsing.
 */

const SUB_CLASSIFIERS = {
  reaction: [
    {
      sub: 'reaction:affirmation',
      test: /\b(yes|exactly|this|real|facts|fr|word|valid|based|say less|goated|king|queen|slay|ate|period|amen|preach|W)\b/i,
    },
    {
      sub: 'reaction:humor',
      test: /\b(lol|lmao|lmfao|haha|hahaha|dead|dying|crying|bruh|omg|lolol|screaming|wheeze)\b/i,
    },
    {
      sub: 'reaction:negative',
      test: /\b(nope|yikes|ew|gross|cringe|mid|trash|terrible|awful|hell no|smh|wtf|delete this|ratio)\b/i,
    },
    {
      sub: 'reaction:emotive',
      test: /\b(love|beautiful|wow|damn|whoa|insane|fire|incredible|amazing|stunning|gorgeous|iconic)\b/i,
    },
  ],

  'one-liner': [
    {
      sub: 'one-liner:observation',
      test: /\b(people|everyone|nobody|society|world|life|always|never|sometimes|funny how|wild how|crazy how|literally)\b/i,
    },
    {
      sub: 'one-liner:confession',
      test: /\b(i just|i really|i can't|honestly|ngl|lowkey|highkey|deadass|i swear|i need|i miss|i hate|i love|me when)\b/i,
    },
    {
      sub: 'one-liner:wit',
      test: /\b(imagine|plot twist|not me|the way|pov|when you|tell me why|why do|how do|somebody|normalize|bring back)\b/i,
    },
    {
      sub: 'one-liner:hot_take',
      test: /\b(unpopular opinion|hot take|actually|overrated|underrated|better than|worst|best|controversial|hear me out|idc|idgaf|fight me)\b/i,
    },
  ],

  question: [
    {
      sub: 'question:rhetorical',
      test: /\b(why do people|why does everyone|who asked|how is this|since when|am i the only|is it just me|how hard is it|why is it so|what happened to|does anyone else|can we stop|who decided)\b/i,
    },
    {
      sub: 'question:genuine',
      test: /\b(what is|what are|how do|how does|how can|what's the best|does anyone know|has anyone|recommend|suggestion|any tips|should i|which one|where can)\b/i,
    },
    {
      sub: 'question:engagement',
      test: /\b(what do you think|what's your|what are your|thoughts on|agree or disagree|am i wrong|right or wrong|what would you|how would you|drop your|tell me your|anyone else|who else)\b/i,
    },
  ],

  media: [
    {
      sub: 'media:film_tv',
      test: /\b(movie|film|show|series|season|episode|watched|watching|netflix|hbo|disney|hulu|prime video|streaming|director|actor|scene|cinematography|spider-?man|marvel|dc|mcu|star wars|horror|thriller|documentary)\b/i,
    },
    {
      sub: 'media:music',
      test: /\b(song|album|music|artist|concert|tour|lyrics|beat|track|rap|hip hop|r&b|jazz|vinyl|playlist|spotify|verse|producer|sample)\b/i,
    },
    {
      sub: 'media:anime_manga',
      test: /\b(anime|manga|one piece|naruto|jujutsu|demon slayer|dragon ball|attack on titan|studio ghibli|miyazaki|shonen|seinen|isekai|waifu|crunchyroll)\b/i,
    },
    {
      sub: 'media:gaming',
      test: /\b(gaming|gamer|fps|rpg|mmo|fortnite|elden ring|zelda|mario|playstation|xbox|nintendo|steam|console|controller|boss fight|speedrun|esports|competitive|ranked|guilty gear|street fighter)\b/i,
    },
  ],

  race: [
    {
      sub: 'race:cultural_reference',
      test: /\b(cultur|tradition|diaspora|heritage|ethnic|folk|indigenous|ancestr|ritual|custom|festival|african american|latina|asian american|native|aboriginal)\b/i,
    },
    {
      sub: 'race:structural_critique',
      test: /\b(systemic|structural|institution|redlin|segregat|discriminat|supremac|oppression|coloniz|decoloni|imperialis|police|carceral|prison|incarcerat|gentrific|reparation|abolit|critical race|anti-?black)\b/i,
    },
    {
      sub: 'race:intersectional',
      test: /\b(intersect|class|gender|queer|disabilit|immigration|labor|solidarity|coalition|margin|privilege.*class|class.*privilege)\b/i,
    },
    {
      sub: 'race:personal_experience',
      test: /\b(i('m| am).*black|i('m| am).*brown|i('m| am).*asian|i('m| am).*white|my race|my skin|grew up|my family|my community|as a (black|brown|asian|white|poc|bipoc))\b/i,
    },
  ],

  'sex-gender': [
    {
      sub: 'sex-gender:queer_identity',
      test: /\b(queer|lgbtq|nonbinar|enby|bisexual|pansexual|asexual|ace|aromantic|pride|coming out|closet|drag|stonewall|rainbow)\b/i,
    },
    {
      sub: 'sex-gender:gender_discourse',
      test: /\b(masculin|feminin|patriarch|misogyn|sexis|gender roles?|gender norm|toxic masculin|feminism|feminist|manhood|womanhood|gender binary|cisgender|cis |trans (rights|people|women|men)|terf|gender critical)\b/i,
    },
    {
      sub: 'sex-gender:romantic_dynamics',
      test: /\b(dating|relationship|partner|breakup|ex |marriage|divorce|tinder|hinge|bumble|situationship|toxic relationship|love bomb|attachment|commitment|monogam|polyamor|open relationship)\b/i,
    },
    {
      sub: 'sex-gender:sexuality',
      test: /\b(sex|sexual|libido|libidinal|kink|fetish|hookup|intimacy|desire|arousal|erotic|porn|onlyfans|consent|virgin)\b/i,
    },
    {
      sub: 'sex-gender:personal_reflection',
      test: /\b(i (feel|felt|think|thought|realize|realized).*gender|my (identity|sexuality|orientation|body|transition)|coming out|self.?discovery|dysphori|euphori)\b/i,
    },
  ],

  philosophy: [
    {
      sub: 'philosophy:continental',
      test: /\b(foucault|deleuze|nietzsche|heidegger|derrida|lacan|zizek|žižek|baudrillard|sartre|camus|beauvoir|merleau|husserl|gadamer|habermas|adorno|benjamin|horkheimer|marcuse|lyotard|butler|spivak|said|fanon|phenomeno|hermeneutic|deconstruct|post.?structur|critical theory|frankfurt school|simulacr|rhizom|différance|genealogy|archaeology|biopolitics|panoptic|deterritorializ)\b/i,
    },
    {
      sub: 'philosophy:ethics_morality',
      test: /\b(ethics|ethical|moral|virtue|deontolog|consequential|utilitarian|categorical imperative|trolley|duty|obligation|good and evil|right and wrong|justice|fairness|care ethics|compassion|empathy|altruism|egoism|nihilis)\b/i,
    },
    {
      sub: 'philosophy:epistemology',
      test: /\b(epistemolog\w*|knowledge|truth|belief|justif\w*|skeptic\w*|empiric\w*|rational\w*|a priori|a posteriori|objectiv\w*|subjectiv\w*|relativis\w*|constructivis\w*|paradigm|kuhn|popper|falsif\w*|indetermin\w*|underdetermin\w*|hermeneutic circle)\b/i,
    },
    {
      sub: 'philosophy:social_political',
      test: /\b(social contract|rawls|marx|gramsci|hegemony|ideology|alienation|class (struggle|consciousness)|praxis|dialectic|materialis|power|sovereignty|state of nature|hobbes|locke|rousseau|arendt|agamben|biopolitics|necropolitics|anarchis|commun)\b/i,
    },
  ],

  tech: [
    {
      sub: 'tech:ai_ml',
      test: /\b(ai|artificial intelligence|gpt|llm|openai|anthropic|claude|chatgpt|machine learning|neural|deep learning|transformer|diffusion|stable diffusion|midjourney|dall-?e|generative|agi|alignment|hallucination|prompt|fine.?tun|training data|inference|token|embedding|vector|rag|agent|copilot|gemini|llama|mistral)\b/i,
    },
    {
      sub: 'tech:programming',
      test: /\b(code|coding|programming|developer|software|engineer|github|git|repo|bug|debug|deploy|devops|frontend|backend|fullstack|javascript|typescript|python|rust|react|node|api|database|sql|css|html|docker|kubernetes|ci\/cd|refactor|pull request|merge|branch|stack overflow|leetcode|algorithm|data structure)\b/i,
    },
    {
      sub: 'tech:crypto_web3',
      test: /\b(crypto|bitcoin|ethereum|blockchain|web3|nft|defi|dao|token|wallet|mining|solana|doge|memecoin|smart contract|metaverse|decentraliz)\b/i,
    },
    {
      sub: 'tech:consumer',
      test: /\b(iphone|macbook|apple|samsung|google pixel|android|ios|app store|gadget|laptop|tablet|wearable|airpods|watch|smart home|alexa|siri|tech company|startup|silicon valley|meta|twitter|threads|instagram)\b/i,
    },
  ],

  political: [
    {
      sub: 'political:domestic',
      test: /\b(trump|biden|democrat|republican|congress|senate|house|scotus|supreme court|gop|dnc|rnc|election|vote|ballot|gerrymandr|filibuster|legislat|governor|mayor|policy|healthcare|gun control|abortion|roe|second amendment|first amendment|constitution|immigration|border|ice|tariff|tax)\b/i,
    },
    {
      sub: 'political:international',
      test: /\b(palestin|israel|gaza|ukraine|russia|china|eu|european|nato|un|united nations|geopolit|diplomat|sanction|war|conflict|refugee|asylum|coup|regime|dictator|authoritarian|global south|third world|imperialis|colonial|neocolonial|middle east|africa|latin america)\b/i,
    },
    {
      sub: 'political:protest_activism',
      test: /\b(protest|march|rally|demonstrat|activis|organiz|mutual aid|solidarity|boycott|strike|civil disobedience|direct action|grassroot|movement|resist|abolit|defund|liberation|free palestine|blm|black lives matter|occupy|antifa|community organiz)\b/i,
    },
  ],
};

/**
 * Sub-classify a post given its text and primary tag.
 * Returns string[] of matching sub-tags (may be empty).
 */
export function subClassify(text, primaryTag, tags) {
  const matchedSubs = [];
  const allTags = new Set(tags);

  for (const parentTag of Object.keys(SUB_CLASSIFIERS)) {
    if (parentTag !== primaryTag && !allTags.has(parentTag)) continue;
    for (const { sub, test } of SUB_CLASSIFIERS[parentTag]) {
      if (test.test(text)) {
        matchedSubs.push(sub);
      }
    }
  }

  return matchedSubs;
}

export { SUB_CLASSIFIERS };
