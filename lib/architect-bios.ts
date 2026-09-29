import type { ArchitectKey } from "./architects";

/**
 * The architects' lives, for their pages in the Appendix: a few paragraphs
 * each, after their Wikipedia articles and the sources those articles draw on
 * (and, for the four without an article of their own, the archives and
 * histories Wikipedia cites where it mentions them). A note in the text is
 * written [n], numbering the entries of `sources` from 1.
 */
export interface Source {
  author?: string;
  title: string;
  /** Publisher, journal, date — everything after the title. */
  detail?: string;
  url?: string;
}

export interface Biography {
  text: string[];
  sources: Source[];
}

const wikipedia = (article: string): Source => ({
  title: article.replace(/_/g, " ").replace(/ \((architect|Berkeley, California)\)$/, ""),
  detail: "Wikipedia",
  url: `https://en.wikipedia.org/wiki/${article}`,
});

const EDA = (name: string, slug: string): Source => ({
  author: "Environmental Design Archives, UC Berkeley",
  title: name,
  url: `https://ced.berkeley.edu/collections/${slug}`,
});

export const BIOGRAPHIES: Record<ArchitectKey, Biography> = {
  maybeck: {
    text: [
      "Bernard Ralph Maybeck was born in New York City on February 7, 1862, the son of a German immigrant, and trained at the École des Beaux-Arts in Paris. One of his first jobs was as a draughtsman for Carrère and Hastings on the Ponce de Leon Hotel in St. Augustine, Florida, where his father worked as a woodcarver.[1]",
      "He came to Berkeley in 1892 and taught engineering drawing and architectural design at the University of California from 1894 to 1903, mentoring a generation that included Julia Morgan and William Wurster.[1][2] In the San Francisco office of A. Page Brown he worked on the Swedenborgian Church, whose rush-seated chairs are counted the first of the Mission style.[1][3]",
      "Maybeck never kept to one style — redwood shingle, Gothic tracery, Mission and Beaux-Arts classicism all served him — believing each problem wanted a solution of its own.[1] His First Church of Christ, Scientist (1910) on Dwight Way is a National Historic Landmark and is reckoned among his masterpieces;[1][4] for the Panama-Pacific International Exposition of 1915 he built San Francisco's Palace of Fine Arts.[1]",
      "He was closely involved in the Hillside Club, whose ideals — that building should enhance the hills rather than subdue them, and roads follow the lie of the land — shaped the Berkeley hills,[1][5] and he designed costumes and sets for its plays.[6] In La Loma Park, the hillside he made his own, are Rose Walk, the Lawson House, the Temple of Wings — which he began in 1911 — and, after the fire of 1923, the family's houses on what became Maybeck Twin Drive, the first of them built of Bubblestone, a foamed cement.[1][7][8] He received the AIA Gold Medal in 1951 and died in 1957, aged 95.[1]",
    ],
    sources: [
      wikipedia("Bernard_Maybeck"),
      {
        author: "Kenneth H. Cardwell",
        title: "Bernard Maybeck: Artisan, Architect, Artist",
        detail: "Salt Lake City: Peregrine Smith, 1977",
        url: "https://archive.org/details/bernardmaybeckar0000card",
      },
      {
        author: "Leslie Mandelson Freudenheim",
        title: "Building with Nature: Inspiration for the Arts & Crafts Home",
        detail: "Gibbs Smith, 2005",
        url: "https://archive.org/details/buildingwithnatu00freu_0",
      },
      {
        author: "Berkeley Architectural Heritage Association",
        title: "Berkeley Landmarks: First Church of Christ, Scientist",
        url: "http://old.berkeleyheritage.com/berkeley_landmarks/1christ_scientist.html",
      },
      {
        author: "Kenneth R. Trapp, ed.",
        title: "The Arts and Crafts Movement in California: Living the Good Life",
        detail: "Abbeville Press, 1993",
      },
      { author: "Annie Fraser", title: "Hillside Club Yearbook 1924–1925", detail: "Berkeley: Hillside Club, 1925" },
      {
        author: "Daniella Thompson",
        title: "Maybeck Made La Loma Park His Own Country",
        detail: "Berkeley Daily Planet, April 30, 2009; Berkeley Architectural Heritage Association",
        url: "http://old.berkeleyheritage.com/eastbay_then-now/maybeck_country.html",
      },
      {
        author: "Susan Cerny",
        title: "The Temple of Wings, 2800 Buena Vista Way",
        detail: "Berkeley Architectural Heritage Association, 2002",
        url: "http://old.berkeleyheritage.com/berkeley_landmarks/temple_of_wings.html",
      },
    ],
  },

  morgan: {
    text: [
      "Julia Morgan was born in San Francisco on January 20, 1872, and grew up across the bay in Oakland.[1] At the University of California she studied civil engineering — there was no course in architecture — and in 1894 became the first woman to take that degree at Berkeley.[1][2] Bernard Maybeck, one of her lecturers, taught her architecture at his home and urged her on to Paris.[1]",
      "The École des Beaux-Arts had never admitted a woman to study architecture. Morgan sat its entrance examination three times, passing thirteenth of 376 candidates, and in 1902 became the first woman to receive its certificate in architecture — in three years rather than the usual five.[1][2][3]",
      "Home again, she drew for John Galen Howard on the University's new buildings, among them the Hearst Mining Building and the Greek Theatre.[1] In 1904 she became the first woman licensed to practise architecture in California,[4] and completed El Campanil at Mills College, a reinforced-concrete bell tower that came through the 1906 earthquake unharmed. Her rebuilding of the fire-gutted Fairmont Hotel made her name.[1]",
      "Over a career of more than 700 buildings she designed Hearst Castle at San Simeon for William Randolph Hearst, YWCAs across the West, and much of Mills College.[1] In Berkeley she thought St. John's Presbyterian Church on College Avenue her finest Craftsman work,[1][5] and built the Berkeley City Club of 1929. She retired in 1950 and died in 1957; in 2014 she became the first woman awarded the AIA Gold Medal.[1][6]",
    ],
    sources: [
      wikipedia("Julia_Morgan"),
      {
        author: "Mark Anthony Wilson",
        title: "Julia Morgan: Architect of Beauty",
        detail: "Layton, Utah: Gibbs Smith, 2007",
      },
      {
        author: "Sara Holmes Boutelle",
        title: "Julia Morgan, Architect",
        detail: "New York: Abbeville Press, revised edition 1995",
      },
      {
        author: "Karen McNeill",
        title: "Julia Morgan: Gender, Architecture, and Professional Style",
        detail: "Pacific Historical Review 76, no. 2 (2007): 229–268",
        url: "https://doi.org/10.1525/phr.2007.76.2.229",
      },
      {
        author: "Daniella Thompson",
        title: "Berkeley Landmarks: St. John's Presbyterian Church",
        detail: "Berkeley Architectural Heritage Association",
        url: "http://old.berkeleyheritage.com/berkeley_landmarks/st._johns_presb.html",
      },
      {
        author: "American Institute of Architects",
        title: "2014 AIA Gold Medal Awarded to Julia Morgan, FAIA",
        detail: "press release, December 2013",
        url: "https://web.archive.org/web/20131213184041/https://www.aia.org/press/AIAB100853",
      },
    ],
  },

  howard: {
    text: [
      "John Galen Howard was born in Chelmsford, Massachusetts, on May 8, 1864, a physician's son.[1][2] He studied at MIT from 1882 to 1885 and at the École des Beaux-Arts from 1891 to 1893, and worked for H. H. Richardson, for Richardson's successors Shepley, Rutan & Coolidge, and for McKim, Mead & White.[1]",
      "In New York, as Howard & Cauldwell, he designed the Electric Tower at the heart of Buffalo's Pan-American Exposition of 1901. His entry in the competition to plan the University of California did not win outright, but that year the Regents chose him to carry out the winning Hearst Plan. He moved west, and in 1903 founded the University's School of Architecture.[1][3]",
      "As supervising architect he gave the campus its Beaux-Arts heart: the Hearst Mining Building, the Greek Theatre, Doe Library, Sather Gate, Wheeler Hall, Sather Tower — the Campanile — and California Memorial Stadium.[1][3] In the town he built Cloyne Court (1904) and, in 1912, a house of his own beside Rose Walk.[1][4] Julia Morgan was his draughtswoman from 1902 to 1904, though she didn't remember the job fondly.[1][5]",
      "His hold on the University loosened after President Benjamin Ide Wheeler retired in 1919. The Hearst Gymnasium went to Morgan and Maybeck in 1922 without him, and in 1924 his contract was not renewed. He gave up practice in 1927 but taught until his death in 1931.[1][3]",
    ],
    sources: [
      wikipedia("John_Galen_Howard"),
      {
        author: "Alan Michelson",
        title: "John Galen Howard",
        detail: "Pacific Coast Architecture Database (PCAD)",
        url: "http://pcad.lib.washington.edu/person/367/",
      },
      {
        author: "Sally B. Woodbridge",
        title: "John Galen Howard and the University of California",
        detail: "University of California Press, 2002",
        url: "https://books.google.com/books?id=wP0rR_x0KFEC",
      },
      {
        author: "Susan Dinkelspiel Cerny",
        title: "An Architectural Guidebook to San Francisco and the Bay Area",
        detail: "Gibbs Smith, 2007",
        url: "https://books.google.com/books?id=FkVQx6MWa8MC&pg=PA316",
      },
      {
        author: "Mark Anthony Wilson",
        title: "Julia Morgan: Architect of Beauty",
        detail: "Gibbs Smith, 2007",
      },
    ],
  },

  ratcliff: {
    text: [
      "Walter Harris Ratcliff Jr. was born in London in 1881, the son of an Episcopal clergyman who kept a school. The family emigrated when he was a boy and settled in Berkeley in 1898.[1][2] He graduated from the University of California in chemistry, with honours, in 1903 — but was already building: a speculative shingled house of 1902 made him and a friend fifty dollars' profit, and led to more.[2]",
      "After two years of travel and study in Europe, including the British School at Rome, he joined John Galen Howard's office, working on the Hearst Mining Building and Doe Library, and by 1908 had a practice of his own, at first as Ratcliff & Jacobs.[1][2] His houses drew on the English cottage — roofs that suggest thatch, half-timbered walls — and he is credited with bringing the English manner to Berkeley.[2]",
      "In 1913 he became Berkeley's first city architect, and in 1915 helped the city write the first zoning ordinance in California; in the post he built fire stations and schools.[1][2] Downtown, his twelve-storey Chamber of Commerce Building of 1925 was the city's first high-rise.[3] From 1923 he was architect and planner to Mills College, where he worked in the Spanish Colonial style.[2] Hillside School and the Berkeley Day Nursery are among his buildings on the National Register.[1]",
      "His son Robert joined the office in 1946. Walter retired in 1955 and died in Berkeley in 1973, aged 92; the firm he founded was carried on by his son and grandson.[1][2]",
    ],
    sources: [
      wikipedia("Walter_Ratcliff"),
      {
        author: "Nicholas Hanson",
        title: "Walter H. Ratcliff, Jr.",
        detail: "Berkeley Architectural Heritage Association archives, 1980; via Berkeley Citizen",
        url: "https://berkeleycitizen.org/landmarks/corpyard19.htm",
      },
      wikipedia("Chamber_of_Commerce_Building_(Berkeley,_California)"),
    ],
  },

  hays: {
    text: [
      "William Charles Hays was born in Philadelphia in 1873 and took his degree in architecture at the University of Pennsylvania in 1893.[1][2] A travelling fellowship carried him to the American Academy in Rome, to Paris, and through Europe and Egypt; in 1894 he began to practise in Philadelphia.[1][3]",
      "He came to San Francisco in 1904, worked with Howard & Galloway, and opened his own office in 1908.[1][3] From 1906 to 1943 he taught architecture at the University of California — thirty-seven years — and was acting head of its School of Architecture from 1917 to 1919.[1]",
      "His buildings are measured and classical. For the University he designed Giannini Hall (1930), which completed the agricultural group around John Galen Howard's courtyard, its figures of harvest modelled by his wife, Ellah Hays,[4] and a number of buildings at Davis.[3] In the town he built the centrepiece of Berkeley High School — its academic building of 1922 — and, with Walter Ratcliff, its first gymnasium,[5] as well as Presbyterian churches in San Francisco and Oakland, schools, fraternity houses and homes.[3]",
      "A Fellow of the American Institute of Architects and a charter member of the Beaux-Arts Institute,[1] he also wrote on architecture — among other things a 1915 survey of Howard's work.[6] He lived in Berkeley until his death in 1963, at 89.[3]",
    ],
    sources: [
      EDA("Hays, William Charles", "hays-william-charles"),
      {
        author: "University of Pennsylvania Archives",
        title: "William Charles Hays",
        detail: "Penn People",
        url: "https://archives.upenn.edu/exhibits/penn-people/biography/william-charles-hays/",
      },
      {
        author: "Online Archive of California",
        title: "William C. Hays Collection, 1894–1962",
        detail: "finding aid, Environmental Design Archives",
        url: "https://oac.cdlib.org/findaid/ark:/13030/tf5z09n8bh/entire_text/",
      },
      wikipedia("Giannini_Hall"),
      wikipedia("Berkeley_High_School_Campus_Historic_District"),
      {
        author: "William C. Hays",
        title: "Some Architectural Works of John Galen Howard",
        detail: "The Architect & Engineer 40, no. 1 (January 1915)",
        url: "https://archive.org/details/architectenginee4015sanf/page/n53",
      },
    ],
  },

  coxhead: {
    text: [
      "Ernest Albert Coxhead was born in Eastbourne, Sussex, in 1863, the fourth of six children of a retired schoolmaster.[1] Articled at fifteen to a civil engineer, he went up to London in 1883 to work for Frederic Chancellor, a restorer of Gothic churches, and studied at the Royal Academy and the Architectural Association.[1][2]",
      "In 1886 he sailed for Los Angeles with his elder brother, Almeric, and was soon designing Episcopal churches across Southern California. By 1890 the brothers had moved to San Francisco as Coxhead & Coxhead, and Ernest was, in effect, the church's architect: seventeen of his churches were built, and eleven stand.[1]",
      "When his patron, Bishop William Kip, died in 1893, Coxhead turned to houses — town houses in San Francisco, and big houses in Palo Alto, Alameda and Berkeley.[1][3] They are shingled, after the English country house, with parts of different periods set against each other for effect, and they helped begin the Arts and Crafts way of building in California.[1][2][4] In Berkeley his Allanoke Manor (1903) on Le Roy Avenue is a city landmark.[1][5]",
      "In 1918–19 he went to Le Mans to organise and direct the American Expeditionary Force's school of architecture, founded by John Galen Howard, for American servicemen stationed in France.[1][2] He came back to Berkeley and lived there until his death in 1933.[1]",
    ],
    sources: [
      wikipedia("Ernest_Coxhead"),
      EDA("Coxhead, Ernest A.", "coxhead-ernest"),
      {
        author: "Richard Longstreth",
        title: "On the Edge of the World: Four Architects in San Francisco at the Turn of the Century",
        detail: "University of California Press, 1998",
      },
      {
        author: "Robert Winter",
        title: "Toward a Simpler Way of Life: The Arts & Crafts Architects of California",
        detail: "University of California Press, 1997",
      },
      {
        author: "Daniella Thompson",
        title: "Allenoke Manor Was a Scene of Hospitality for 5 Decades",
        detail: "Berkeley Daily Planet, March 21, 2008",
        url: "http://www.berkeleydailyplanet.com/issue/2008-03-21/article/29543",
      },
    ],
  },

  thomas: {
    text: [
      "John Hudson Thomas was born in Ward, Nevada, in 1878, and came to the Bay Area as a small child.[1][2] He graduated from Yale in 1902, took a graduate degree in architecture at Berkeley in 1904, and spent the next two years in John Galen Howard's office.[1][2]",
      "In 1907 he went into partnership with George Plowman; together they built some fifty houses in the Arts & Crafts manner.[1][2] In 1910 he opened his own office — one of the first tenants of the new Studio Building on Shattuck Avenue, home of the Berkeley Arts and Crafts school — and came to know Bernard Maybeck and Julia Morgan, whose ideas mark his early work.[1][3]",
      "His reputation rests on houses, hundreds of them, in which he mixed his sources with rare freedom: Craftsman and Prairie School, Mission, Gothic and Tudor, Art Nouveau and the English cottage, and later the crisp geometry of the Vienna Secession.[1][4] In Berkeley they include the Spring Mansion (1912–14), \"The Rocks\" for the Wintermutes (1913), and the cloistered Hume house on Buena Vista Way.[1][2]",
      "As the commissions grew larger his work grew more conventional, though he kept a gift for interiors. He worked until his death in 1945.[1]",
    ],
    sources: [
      wikipedia("John_Hudson_Thomas"),
      EDA("Thomas, John Hudson", "thomas-john-hudson"),
      {
        author: "Online Archive of California",
        title: "Finding Aid for the John Hudson Thomas Papers",
        url: "http://www.oac.cdlib.org/findaid/ark:/13030/c8qv3ktk/",
      },
      {
        author: "Mark A. Wilson",
        title: "New Life for a Landmark",
        detail: "San Francisco Chronicle, January 21, 2007",
        url: "https://www.sfgate.com/bayarea/article/New-life-for-a-landmark-2655300.php",
      },
    ],
  },

  plachek: {
    text: [
      "James William Plachek was born in Illinois on January 6, 1884.[1] He learned his trade as a draughtsman for William H. Weeks and made his name in the San Francisco City Architect's office, designing buildings to stand up to earthquakes. In 1912 he opened his own office in Berkeley,[1] in the Heywood Building downtown.[2]",
      "For the next thirty years he was among downtown Berkeley's busiest architects: the Corder Building on Shattuck Avenue, the UC Theatre (1917) on University Avenue, and schools, churches and civic buildings.[2][3] As early as 1919 The Architect and Engineer gave a long illustrated article to his Berkeley work.[3][4]",
      "His best-known building is the Central Library on Kittredge Street, built in 1930–31 in the zig-zag Moderne to replace the Carnegie library of 1905.[5] He also designed the library's North Branch (1936) and worked on the Alameda County Courthouse beside Lake Merritt in Oakland (1935–36).[1]",
      "He was a civic figure as well as an architect — president of the Chamber of Commerce, a member of the city Planning Commission, and on the library's building committee from 1921.[6] He died in 1948, aged 64.[1]",
    ],
    sources: [
      {
        author: "Alan Michelson",
        title: "James William Plachek (Architect)",
        detail: "Pacific Coast Architecture Database (PCAD)",
        url: "https://pcad.lib.washington.edu/person/622/",
      },
      wikipedia("Corder_Building"),
      wikipedia("UC_Theatre"),
      {
        author: "Wells Drury",
        title: "Buildings in Berkeley Designed by James W. Plachek, Architect",
        detail: "The Architect and Engineer 56, no. 2 (February 1919): 60–80",
        url: "https://babel.hathitrust.org/cgi/pt?id=uc1.c041987505;view=1up;seq=137",
      },
      wikipedia("Berkeley_Public_Library"),
      {
        author: "Historic American Buildings Survey",
        title: "Berkeley Public Library, 2090 Kittredge Street (HABS CA-2697)",
        detail: "Library of Congress",
        url: "https://www.loc.gov/pictures/item/ca2559/",
      },
    ],
  },

  gutterson: {
    text: [
      "Henry Higby Gutterson was born in Owatonna, Minnesota, in 1884.[1] He studied architecture at the University of California under John Galen Howard, graduating in 1905, and at the École des Beaux-Arts in Paris from 1906 to 1909.[1][2]",
      "Back in California he worked for Howard on the Panama-Pacific Exposition and on St. Francis Wood, and for the City of Oakland, before opening his own office in 1914.[2] From then until his death he was supervising architect of St. Francis Wood in San Francisco, where some seventy-five houses are his.[1][2]",
      "He worked closely with Bernard Maybeck — on the Sunday School of the First Church of Christ, Scientist, and at Principia College in Illinois, where he oversaw the building of Maybeck's campus and designed several of its buildings himself.[2][3] After the fire of 1923 he designed the cottages and duplexes along Maybeck's Rose Walk.[2][4] He designed many Christian Science churches, the Outlands — the Flanders Mansion — in Carmel,[5] and, with William Corlett, Berkeley High School's Art Deco shop and science buildings of 1939–40.[6]",
      "He taught at the University in 1910–11 and 1920–21, and in 1946 the American Institute of Architects honoured him for his work to unite the profession.[2] He died in 1954.[1]",
    ],
    sources: [
      {
        author: "Alan Michelson",
        title: "Henry Higby Gutterson (Architect)",
        detail: "Pacific Coast Architecture Database (PCAD)",
        url: "https://pcad.lib.washington.edu/person/575/",
      },
      EDA("Gutterson, Henry", "gutterson-henry"),
      wikipedia("Principia_College_Historic_District"),
      wikipedia("Rose_Walk_(Berkeley,_California)"),
      wikipedia("Outlands_in_the_Eighty_Acres"),
      wikipedia("Berkeley_High_School_Campus_Historic_District"),
    ],
  },

  yelland: {
    text: [
      "William Raymond Yelland was born in Saratoga, California, in 1890; the landscape painter Raymond Dabb Yelland was his great-uncle.[1][2] He graduated in architecture from the University of California in 1913, spent a year at the University of Pennsylvania, and was licensed in 1916.[1][3]",
      "Stationed in France in the First World War, he absorbed there the influences that shaped the rest of his career.[1] He joined the Oakland office of Miller and Warnecke in 1920, and by 1924 had a practice of his own on Franklin Street in Oakland.[1][3]",
      "He became the Bay Area's master of the storybook style.[4] On Shattuck Avenue he built the Tupper & Reed music store (1925), in brick under a steep roof topped by the figure of a piper, and on Spruce Street, for the young builder Jack Thornburg, Thornburg Village — Normandy Village — whose first court opened in 1927: apartments of brick and stone with outside stairs, gargoyles, and roofs laid to look worn with age.[1] His houses are found from Berkeley, Oakland and Piedmont to Sacramento and Modesto.[4]",
      "In the early 1950s he moved to Milan, where he lived for the rest of his life. He died in 1966.[1][3]",
    ],
    sources: [
      {
        author: "Daniella Thompson",
        title: "Thornburg's Storybook Village Succeeded Kellogg's Farm",
        detail: "Berkeley Daily Planet, January 8, 2009",
        url: "https://www.berkeleydailyplanet.com/issue/2009-01-08/article/31958",
      },
      wikipedia("Raymond_Dabb_Yelland"),
      EDA("Yelland, William", "yelland-william"),
      wikipedia("Storybook_architecture"),
    ],
  },

  esherick: {
    text: [
      "Joseph Esherick was born in Philadelphia on December 28, 1914, a nephew of the sculptor Wharton Esherick.[1] He graduated in architecture from the University of Pennsylvania in 1937 and came west to work for Gardner Dailey in San Francisco.[1][2]",
      "Around 1950 he opened his own practice. Following Maybeck and William Wurster in the Bay tradition, he designed hundreds of houses shaped by region, site and the people who would live in them.[1] He taught at Berkeley for many years,[1][2] and in 1959 was one of the founders, with Wurster and Vernon DeMars, of its College of Environmental Design.[1]",
      "Among his best-known works are the demonstration houses at The Sea Ranch on the Sonoma coast, made with the landscape architect Lawrence Halprin; The Cannery in San Francisco (1968); and the Monterey Bay Aquarium (1984).[1][3] In Berkeley he built the University's Harold E. Jones Child Study Center (1960) and the Flora Lamson Hewlett Library of the Graduate Theological Union (1981).[1]",
      "In 1972 he reorganised his office with three long-time associates as Esherick Homsey Dodge & Davis, which won the AIA's Architecture Firm Award in 1986; he received the AIA Gold Medal in 1989.[1][4] He died in 1998.[1][2]",
    ],
    sources: [
      wikipedia("Joseph_Esherick_(architect)"),
      {
        author: "Ralph Blumenthal",
        title: "Joseph Esherick, 83, an Acclaimed Architect",
        detail: "The New York Times, December 25, 1998",
        url: "https://www.nytimes.com/1998/12/25/arts/joseph-esherick-83-an-acclaimed-architect.html",
      },
      {
        author: "Carol Ness",
        title: "A Bay Region Master",
        detail: "Berkeleyan, University of California, Berkeley, November 5, 2008",
        url: "https://web.archive.org/web/20230328153600/https://newsarchive.berkeley.edu/news/berkeleyan/2008/11/05_esherick.shtml",
      },
      { author: "American Institute of Architects", title: "Gold Medal", url: "https://www.aia.org/awards/7046-gold-medal" },
    ],
  },
};

/** A paragraph's running text and its notes, in order: `[1][3]` becomes one run of notes. */
export function citations(para: string): ({ text: string; notes?: undefined } | { text?: undefined; notes: number[] })[] {
  const runs: ({ text: string; notes?: undefined } | { text?: undefined; notes: number[] })[] = [];
  let at = 0;
  for (const m of para.matchAll(/(?:\[\d+\])+/g)) {
    if (m.index > at) runs.push({ text: para.slice(at, m.index) });
    runs.push({ notes: [...m[0].matchAll(/\d+/g)].map((n) => Number(n[0])) });
    at = m.index + m[0].length;
  }
  if (at < para.length) runs.push({ text: para.slice(at) });
  return runs;
}
